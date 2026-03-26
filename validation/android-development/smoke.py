#!/usr/bin/env python3

from __future__ import annotations

import csv
import json
import os
import re
import shutil
import signal
import string
import subprocess
import sys
import tempfile
import threading
import time
from contextlib import contextmanager
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import NoReturn

ANSI_RE = re.compile(r"\x1b\[[0-9;?]*[ -/]*[@-~]")


def utc_now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def utc_stamp() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")


def strip_ansi(text: str) -> str:
    return ANSI_RE.sub("", text)


def env_bool(name: str, default: bool) -> bool:
    raw = os.environ.get(name)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


def log(msg: str) -> None:
    print(f"[{utc_now()}] {msg}", flush=True)


def warn(msg: str) -> None:
    log(f"WARN: {msg}")


def die(msg: str, code: int = 1) -> NoReturn:
    log(f"ERROR: {msg}")
    raise SystemExit(code)


def gha_enabled() -> bool:
    return bool(os.environ.get("GITHUB_ACTIONS"))


def gha_notice(msg: str) -> None:
    if gha_enabled():
        print(f"::notice::{msg}", flush=True)


def gha_warning(msg: str) -> None:
    if gha_enabled():
        print(f"::warning::{msg}", flush=True)


def gha_error(msg: str) -> None:
    if gha_enabled():
        print(f"::error::{msg}", flush=True)


@contextmanager
def gha_group(title: str):
    if gha_enabled():
        print(f"::group::{title}", flush=True)
    try:
        yield
    finally:
        if gha_enabled():
            print("::endgroup::", flush=True)


def need_cmd(name: str) -> None:
    if shutil.which(name) is None:
        die(f"Missing required command: {name}")


def safe_unlink_tree(path: Path, root: Path) -> None:
    path = path.resolve()
    root = root.resolve()
    if root not in path.parents:
        die(f"Refusing to delete path outside workspace: {path}")
    shutil.rmtree(path)


def resolve_copilot_bin() -> str:
    explicit = os.environ.get("COPILOT_BIN", "").strip()
    if explicit:
        if os.access(explicit, os.X_OK):
            return explicit
        die(f"Copilot CLI not executable: {explicit}")

    found = shutil.which("copilot")
    if found:
        return found

    fallback = (
        Path.home()
        / "Library/Application Support/Code/User/globalStorage/github.copilot-chat/copilotCli/copilot"
    )
    if fallback.exists() and os.access(fallback, os.X_OK):
        return str(fallback)

    die("Copilot CLI not found")


@dataclass(frozen=True)
class Scenario:
    scenario_id: str
    repo_label: str
    repo_url: str
    branch: str
    ref: str
    module_hint: str
    prompt_file: str


@dataclass
class Config:
    repo_root: Path
    script_dir: Path
    validation_dir: Path
    prompts_dir: Path
    scenarios_file: Path
    skill_dir: Path
    media_processor: Path
    run_root: Path
    repos_dir: Path
    prompts_out_dir: Path
    scenarios_out_dir: Path
    logs_dir: Path
    copilot_logs_dir: Path
    summary_tsv: Path
    skill_list_file: Path
    run_log: Path
    model: str
    reasoning_effort: str
    stream_mode: str
    timeout_seconds: int
    skip_clone: bool
    install_skill: bool
    fail_on_scenario_error: bool
    copilot_log_level: str
    copilot_output_format: str
    copilot_max_autopilot_continues: int
    copilot_no_custom_instructions: bool
    copilot_share_session: bool
    copilot_secret_env_vars: str
    use_color: str
    original_stdout_is_tty: bool
    color_enabled: bool
    copilot_bin: str


def make_config() -> Config:
    script_dir = Path(__file__).resolve().parent
    repo_root = (script_dir / "../..").resolve()
    validation_dir = script_dir
    prompts_dir = validation_dir / "prompts"
    scenarios_file = Path(
        os.environ.get("SCENARIOS_FILE", str(validation_dir / "scenarios.json"))
    ).resolve()
    skill_dir = Path(
        os.environ.get(
            "SKILL_DIR", str(repo_root / "skills/android/android-development")
        )
    ).resolve()
    media_processor = Path(
        os.environ.get(
            "MEDIA_PROCESSOR",
            str(repo_root / "scripts/process-android-scenario-artifacts.mjs"),
        )
    ).resolve()

    run_root_env = os.environ.get("RUN_ROOT", "").strip()
    if run_root_env:
        run_root = Path(run_root_env).resolve()
        run_root.mkdir(parents=True, exist_ok=True)
    else:
        run_root = Path(
            tempfile.mkdtemp(prefix=f"android-development-scenarios.{utc_stamp()}.")
        )

    repos_dir = run_root / "repos"
    prompts_out_dir = run_root / "prompts"
    scenarios_out_dir = run_root / "scenarios"
    logs_dir = run_root / "logs"
    copilot_logs_dir = run_root / "copilot-internal-logs"
    summary_tsv = run_root / "summary.tsv"
    skill_list_file = run_root / "skill-package.txt"
    run_log = logs_dir / "run.log"

    for p in [
        repos_dir,
        prompts_out_dir,
        scenarios_out_dir,
        logs_dir,
        copilot_logs_dir,
    ]:
        p.mkdir(parents=True, exist_ok=True)

    original_stdout_is_tty = sys.stdout.isatty()
    use_color = os.environ.get("USE_COLOR", "auto").strip().lower()
    if use_color not in {"auto", "always", "never"}:
        die(f"Invalid USE_COLOR value: {use_color}")

    color_enabled = False
    if use_color == "always":
        color_enabled = True
    elif use_color == "auto":
        color_enabled = original_stdout_is_tty and not gha_enabled()

    return Config(
        repo_root=repo_root,
        script_dir=script_dir,
        validation_dir=validation_dir,
        prompts_dir=prompts_dir,
        scenarios_file=scenarios_file,
        skill_dir=skill_dir,
        media_processor=media_processor,
        run_root=run_root,
        repos_dir=repos_dir,
        prompts_out_dir=prompts_out_dir,
        scenarios_out_dir=scenarios_out_dir,
        logs_dir=logs_dir,
        copilot_logs_dir=copilot_logs_dir,
        summary_tsv=summary_tsv,
        skill_list_file=skill_list_file,
        run_log=run_log,
        model=os.environ.get("MODEL", "gpt-5-mini"),
        reasoning_effort=os.environ.get("REASONING_EFFORT", "low"),
        stream_mode=os.environ.get("STREAM_MODE", "on"),
        timeout_seconds=int(os.environ.get("TIMEOUT_SECONDS", "1500")),
        skip_clone=env_bool("SKIP_CLONE", False),
        install_skill=env_bool("INSTALL_SKILL", True),
        fail_on_scenario_error=env_bool("FAIL_ON_SCENARIO_ERROR", False),
        copilot_log_level=os.environ.get("COPILOT_LOG_LEVEL", "warning"),
        copilot_output_format=os.environ.get("COPILOT_OUTPUT_FORMAT", "text"),
        copilot_max_autopilot_continues=int(
            os.environ.get("COPILOT_MAX_AUTOPILOT_CONTINUES", "20")
        ),
        copilot_no_custom_instructions=env_bool("COPILOT_NO_CUSTOM_INSTRUCTIONS", True),
        copilot_share_session=env_bool("COPILOT_SHARE_SESSION", True),
        copilot_secret_env_vars=os.environ.get(
            "COPILOT_SECRET_ENV_VARS",
            "GH_TOKEN,GITHUB_TOKEN,COPILOT_GITHUB_TOKEN,OPENAI_API_KEY,ANTHROPIC_API_KEY,GOOGLE_API_KEY,AZURE_OPENAI_API_KEY",
        ),
        use_color=use_color,
        original_stdout_is_tty=original_stdout_is_tty,
        color_enabled=color_enabled,
        copilot_bin=resolve_copilot_bin(),
    )


def append_run_log(cfg: Config, message: str) -> None:
    with cfg.run_log.open("a", encoding="utf-8") as f:
        f.write(f"[{utc_now()}] {message}\n")


def log_both(cfg: Config, message: str) -> None:
    log(message)
    append_run_log(cfg, message)


def run_checked(
    cmd: list[str], cwd: Path | None = None, env: dict[str, str] | None = None
) -> None:
    subprocess.run(cmd, cwd=str(cwd) if cwd else None, env=env, check=True)


def git_checkout_fixture(cfg: Config, scenario: Scenario) -> Path:
    repo_dir = cfg.repos_dir / scenario.repo_label

    if cfg.skip_clone and (repo_dir / ".git").exists():
        log_both(cfg, f"Reusing existing repo without refresh: {scenario.repo_label}")
        return repo_dir

    if (repo_dir / ".git").exists():
        log_both(cfg, f"Refreshing existing repo: {scenario.repo_label}")
        fetch_cmd = ["git", "fetch", "--depth", "1", "origin", scenario.branch]
        if scenario.ref:
            fetch_cmd.append(scenario.ref)
        run_checked(
            ["git", "remote", "set-url", "origin", scenario.repo_url], cwd=repo_dir
        )
        run_checked(fetch_cmd, cwd=repo_dir)
        run_checked(["git", "clean", "-ffdqx"], cwd=repo_dir)
        if scenario.ref:
            run_checked(["git", "checkout", "--detach", scenario.ref], cwd=repo_dir)
        else:
            run_checked(
                ["git", "checkout", "--detach", f"origin/{scenario.branch}"],
                cwd=repo_dir,
            )
        return repo_dir

    if repo_dir.exists():
        safe_unlink_tree(repo_dir, cfg.repos_dir)

    log_both(cfg, f"Cloning {scenario.repo_label} from {scenario.repo_url}")
    run_checked(
        [
            "git",
            "clone",
            "--no-tags",
            "--depth",
            "1",
            "--branch",
            scenario.branch,
            scenario.repo_url,
            str(repo_dir),
        ]
    )

    if scenario.ref:
        log_both(cfg, f"Fetching pinned ref {scenario.ref} for {scenario.repo_label}")
        run_checked(
            ["git", "fetch", "--depth", "1", "origin", scenario.ref], cwd=repo_dir
        )
        run_checked(["git", "checkout", "--detach", scenario.ref], cwd=repo_dir)
    else:
        run_checked(
            ["git", "checkout", "--detach", f"origin/{scenario.branch}"], cwd=repo_dir
        )

    return repo_dir


def load_scenarios(cfg: Config) -> list[Scenario]:
    data = json.loads(cfg.scenarios_file.read_text(encoding="utf-8"))
    out: list[Scenario] = []
    for item in data:
        out.append(
            Scenario(
                scenario_id=item["id"],
                repo_label=item["repo_label"],
                repo_url=item["repo_url"],
                branch=item["branch"],
                ref=item.get("ref", ""),
                module_hint=item["module_hint"],
                prompt_file=item["prompt_file"],
            )
        )
    return out


def render_prompt(
    cfg: Config,
    scenario: Scenario,
    repo_dir: Path,
    scenario_dir: Path,
    raw_dir: Path,
    result_json: Path,
    report_md: Path,
) -> str:
    template_path = cfg.prompts_dir / scenario.prompt_file
    template = string.Template(template_path.read_text(encoding="utf-8"))
    return template.safe_substitute(
        repo_dir=str(repo_dir),
        repo_label=scenario.repo_label,
        repo_url=scenario.repo_url,
        module_hint=scenario.module_hint,
        result_json=str(result_json),
        report_md=str(report_md),
        raw_dir=str(raw_dir),
        scenario_dir=str(scenario_dir),
        media_processor=str(cfg.media_processor),
        skill_dir=str(cfg.skill_dir),
    )


def build_copilot_cmd(
    cfg: Config,
    scenario: Scenario,
    repo_dir: Path,
    scenario_dir: Path,
    prompt_text: str,
) -> list[str]:
    cmd = [
        cfg.copilot_bin,
        "--prompt",
        prompt_text,
        "--banner",
        "--stream",
        cfg.stream_mode,
        "--model",
        cfg.model,
        "--reasoning-effort",
        cfg.reasoning_effort,
        "--autopilot",
        "--max-autopilot-continues",
        str(cfg.copilot_max_autopilot_continues),
        "--allow-all-tools",
        "--allow-all-urls",
        "--allow-all-paths",
        "--no-ask-user",
        "--add-dir",
        str(cfg.skill_dir),
        "--add-dir",
        str(repo_dir),
        "--add-dir",
        str(scenario_dir),
        "--log-dir",
        str(cfg.copilot_logs_dir / scenario.scenario_id),
        "--log-level",
        cfg.copilot_log_level,
        "--output-format",
        cfg.copilot_output_format,
    ]

    if not cfg.color_enabled:
        cmd.append("--no-color")

    if cfg.copilot_no_custom_instructions:
        cmd.append("--no-custom-instructions")

    if cfg.copilot_secret_env_vars:
        cmd += ["--secret-env-vars", cfg.copilot_secret_env_vars]

    if cfg.copilot_share_session:
        cmd += ["--share", str(scenario_dir / "copilot-session.md")]

    return cmd


def stream_process(
    cmd: list[str], cwd: Path, log_path: Path, timeout_seconds: int, color_enabled: bool
) -> int:
    log_path.parent.mkdir(parents=True, exist_ok=True)
    clean_log = log_path.open("w", encoding="utf-8", errors="replace")

    env = os.environ.copy()
    if color_enabled:
        env["FORCE_COLOR"] = "1"
        env["CLICOLOR_FORCE"] = "1"

    proc = subprocess.Popen(
        cmd,
        cwd=str(cwd),
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        bufsize=1,
        env=env,
        start_new_session=(os.name != "nt"),
    )

    timed_out = False

    def kill_proc() -> None:
        nonlocal timed_out
        timed_out = True
        try:
            if proc.poll() is not None:
                return
            if os.name == "nt":
                proc.kill()
            else:
                os.killpg(proc.pid, signal.SIGKILL)
        except ProcessLookupError:
            pass

    timer = threading.Timer(timeout_seconds, kill_proc)
    timer.start()

    try:
        assert proc.stdout is not None
        for line in proc.stdout:
            raw = line
            plain = strip_ansi(raw)
            if color_enabled:
                sys.stdout.write(raw)
            else:
                sys.stdout.write(plain)
            sys.stdout.flush()
            clean_log.write(plain)
            clean_log.flush()
    finally:
        timer.cancel()
        clean_log.close()

    rc = proc.wait()
    if timed_out:
        return 124
    return rc


def json_status(path: Path) -> str:
    data = json.loads(path.read_text(encoding="utf-8"))
    return str(data.get("status", "missing"))


def validate_skill_package(cfg: Config) -> str | None:
    npx = shutil.which("npx")
    if not npx:
        if cfg.install_skill:
            die("Project-level skill installation requires npx; set INSTALL_SKILL=0 to skip")
        cfg.skill_list_file.write_text(
            "npx not available; skipped skills package validation\n", encoding="utf-8"
        )
        return None

    with cfg.skill_list_file.open("w", encoding="utf-8") as f:
        subprocess.run(
            [npx, "-y", "skills", "add", str(cfg.repo_root), "--list"],
            cwd=str(cfg.repo_root),
            stdout=f,
            stderr=subprocess.STDOUT,
            check=False,
        )

    return npx


def install_skill_into_repo(
    cfg: Config, npx: str, scenario: Scenario, repo_dir: Path
) -> None:
    install_home = cfg.run_root / "skills-home" / scenario.scenario_id
    npm_cache_dir = install_home / ".npm"
    install_home.mkdir(parents=True, exist_ok=True)
    npm_cache_dir.mkdir(parents=True, exist_ok=True)

    log_both(
        cfg,
        f"Installing skill into project repo: {scenario.repo_label}",
    )
    run_checked(
        [
            npx,
            "-y",
            "skills",
            "add",
            str(cfg.repo_root),
            "--skill",
            cfg.skill_dir.name,
            "-a",
            "github-copilot",
            "-y",
        ],
        cwd=repo_dir,
        env={
            **os.environ,
            "HOME": str(install_home),
            "npm_config_cache": str(npm_cache_dir),
        },
    )


def append_summary(cfg: Config, row: list[str]) -> None:
    with cfg.summary_tsv.open("a", encoding="utf-8", newline="") as f:
        writer = csv.writer(f, delimiter="\t")
        writer.writerow(row)


def write_step_summary(cfg: Config) -> None:
    target = os.environ.get("GITHUB_STEP_SUMMARY", "")
    if not target:
        return

    rows = list(csv.reader(cfg.summary_tsv.open("r", encoding="utf-8"), delimiter="\t"))
    with open(target, "a", encoding="utf-8") as f:
        f.write("# Android Development Scenario Runs\n\n")
        f.write("| Scenario | Repo | Copilot CLI | Result | Duration (s) | Report |\n")
        f.write("| --- | --- | --- | --- | ---: | --- |\n")
        for row in rows[1:]:
            (
                scenario_id,
                repo,
                cli_exit,
                result_status,
                duration_s,
                _result_json,
                report_md,
                _cli_log,
            ) = row
            f.write(
                f"| {scenario_id} | {repo} | {cli_exit} | {result_status} | {duration_s} | {report_md} |\n"
            )
        f.write(f"\nRun root: `{cfg.run_root}`\n")


def run_case(cfg: Config, scenario: Scenario, npx: str | None) -> bool:
    with gha_group(f"{scenario.scenario_id} ({scenario.repo_label})"):
        repo_dir = git_checkout_fixture(cfg, scenario)

        if cfg.install_skill:
            if npx is None:
                die("Project-level skill installation requires npx; set INSTALL_SKILL=0 to skip")
            install_skill_into_repo(cfg, npx, scenario, repo_dir)

        scenario_dir = cfg.scenarios_out_dir / scenario.scenario_id
        raw_dir = scenario_dir / "raw"
        prompt_out = cfg.prompts_out_dir / f"{scenario.scenario_id}.prompt.md"
        result_json = scenario_dir / "result.json"
        report_md = scenario_dir / "report.md"
        cli_log = cfg.logs_dir / f"{scenario.scenario_id}.log"

        scenario_dir.mkdir(parents=True, exist_ok=True)
        raw_dir.mkdir(parents=True, exist_ok=True)
        (cfg.copilot_logs_dir / scenario.scenario_id).mkdir(parents=True, exist_ok=True)

        prompt_body = render_prompt(
            cfg, scenario, repo_dir, scenario_dir, raw_dir, result_json, report_md
        )
        prompt_out.write_text(prompt_body, encoding="utf-8")

        prompt_text = (
            f"Use the android-development skill at {cfg.skill_dir}. "
            f"If it is not installed, read {cfg.skill_dir / 'SKILL.md'} directly and use progressive disclosure "
            f"across the references directory. Work in the repository below and write the required result files "
            f"to the absolute paths provided. Do not ask the user for input.\n\n"
            f"{prompt_body}"
        )

        cmd = build_copilot_cmd(cfg, scenario, repo_dir, scenario_dir, prompt_text)

        log_both(cfg, f"Starting scenario: {scenario.scenario_id}")
        started = time.monotonic()
        cli_exit = stream_process(
            cmd, repo_dir, cli_log, cfg.timeout_seconds, cfg.color_enabled
        )
        duration_s = str(int(time.monotonic() - started))

        result_status = "missing"
        if result_json.exists():
            try:
                result_status = json_status(result_json)
            except Exception:
                result_status = "missing"

        append_summary(
            cfg,
            [
                scenario.scenario_id,
                scenario.repo_label,
                str(cli_exit),
                result_status,
                duration_s,
                str(result_json),
                str(report_md),
                str(cli_log),
            ],
        )

        ok = cli_exit == 0 and result_json.exists() and report_md.exists()
        if ok:
            msg = f"Scenario complete: {scenario.scenario_id} (status={result_status}, duration={duration_s}s)"
            log_both(cfg, msg)
            gha_notice(msg)
            return True

        msg = f"Scenario failed or incomplete: {scenario.scenario_id} (cli_exit={cli_exit}, status={result_status}, duration={duration_s}s)"
        warn(msg)
        append_run_log(cfg, f"WARN: {msg}")
        gha_warning(msg)
        return False


def print_summary(cfg: Config) -> None:
    print("\nSummary:", flush=True)
    text = cfg.summary_tsv.read_text(encoding="utf-8")
    print(text, end="" if text.endswith("\n") else "\n", flush=True)


def main() -> int:
    cfg = make_config()

    need_cmd("git")
    need_cmd("node")
    need_cmd("perl")

    if not cfg.skill_dir.is_dir():
        die(f"Skill directory not found: {cfg.skill_dir}")
    if not (cfg.skill_dir / "SKILL.md").is_file():
        die(f"Skill file not found: {cfg.skill_dir / 'SKILL.md'}")
    if not cfg.media_processor.is_file():
        die(f"Media processor not found: {cfg.media_processor}")
    if not cfg.scenarios_file.is_file():
        die(f"Scenarios file not found: {cfg.scenarios_file}")

    cfg.summary_tsv.write_text(
        "scenario\trepo\tcli_exit\tresult_status\tduration_s\tresult_json\treport_md\tcli_log\n",
        encoding="utf-8",
    )
    cfg.run_log.touch()

    log_both(cfg, f"Run root: {cfg.run_root}")
    log_both(cfg, f"Copilot CLI: {cfg.copilot_bin}")
    log_both(cfg, f"Model: {cfg.model}")
    log_both(cfg, f"Skill dir: {cfg.skill_dir}")
    log_both(cfg, f"Color mode: {cfg.use_color}")

    npx = validate_skill_package(cfg)
    if cfg.install_skill:
        log_both(
            cfg,
            "Project-level skill installation enabled (default; set INSTALL_SKILL=0 to skip)",
        )
    else:
        log_both(cfg, "Skipping project-level skill installation (INSTALL_SKILL=0)")

    failures = 0
    for scenario in load_scenarios(cfg):
        ok = run_case(cfg, scenario, npx)
        if not ok:
            failures += 1

    write_step_summary(cfg)
    print_summary(cfg)
    log_both(cfg, f"Artifacts written under: {cfg.run_root}")

    if failures and cfg.fail_on_scenario_error:
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
