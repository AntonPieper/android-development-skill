#!/usr/bin/env python3
from __future__ import annotations

import argparse
import os
import pathlib
import platform
import re
import shutil
import socket
import subprocess
import sys
import tempfile
import time
import xml.etree.ElementTree as ET
from dataclasses import dataclass
from typing import Sequence


IS_WINDOWS = os.name == "nt"

TEMP_PREFIXES: dict[str, str] = {
	"build": "android-build-",
	"capture": "android-capture-",
	"emulator": "android-emulator-",
}

ANDROID_NS = "{http://schemas.android.com/apk/res/android}"


@dataclass
class ToolingContext:
	repo_root: pathlib.Path | None
	sdk_root: pathlib.Path | None
	java_home: pathlib.Path | None
	adb: pathlib.Path | None
	emulator: pathlib.Path | None
	sdkmanager: pathlib.Path | None
	avdmanager: pathlib.Path | None
	gradle_wrapper: pathlib.Path | None
	compile_sdk: int | None
	java_major: int


@dataclass
class BuildMetadata:
	java_major: int | None = None
	compile_sdk: int | None = None


def stdout(message: str = "") -> None:
	print(message, flush=True)


def stderr(message: str) -> None:
	print(message, file=sys.stderr, flush=True)


def temp_dir(prefix: str, explicit: str | None) -> pathlib.Path:
	if explicit:
		path = pathlib.Path(explicit).expanduser().resolve()
		path.mkdir(parents=True, exist_ok=True)
		return path
	return pathlib.Path(tempfile.mkdtemp(prefix=prefix))


def temp_dir_for(kind: str, explicit: str | None) -> pathlib.Path:
	prefix = TEMP_PREFIXES.get(kind)
	if not prefix:
		raise SystemExit(f"Unknown temp directory kind: {kind}")
	return temp_dir(prefix, explicit)


def which(name: str) -> pathlib.Path | None:
	value = shutil.which(name)
	return pathlib.Path(value).resolve() if value else None


def iter_build_files(repo_root: pathlib.Path | None) -> list[pathlib.Path]:
	if not repo_root:
		return []
	files: list[pathlib.Path] = []
	for pattern in ("build.gradle", "build.gradle.kts"):
		for path in repo_root.rglob(pattern):
			parts = set(path.parts)
			if "build" in parts or ".gradle" in parts:
				continue
			files.append(path)
	return sorted(set(files))


def candidate_sdk_roots() -> list[pathlib.Path]:
	roots: list[pathlib.Path] = []
	for key in ("ANDROID_SDK_ROOT", "ANDROID_HOME"):
		value = os.environ.get(key)
		if value:
			roots.append(pathlib.Path(value).expanduser())

	home = pathlib.Path.home()
	if platform.system() == "Darwin":
		roots.append(home / "Library" / "Android" / "sdk")
	elif platform.system() == "Windows":
		local_app_data = os.environ.get("LOCALAPPDATA")
		if local_app_data:
			roots.append(pathlib.Path(local_app_data) / "Android" / "Sdk")
		roots.append(home / "AppData" / "Local" / "Android" / "Sdk")
	else:
		roots.extend([
			home / "Android" / "Sdk",
			home / "Android" / "sdk",
			home / "Library" / "Android" / "sdk",
		])

	seen: set[pathlib.Path] = set()
	unique: list[pathlib.Path] = []
	for root in roots:
		if root in seen:
			continue
		seen.add(root)
		unique.append(root)
	return unique


def find_sdk_root() -> pathlib.Path | None:
	for root in candidate_sdk_roots():
		if (root / "platform-tools").exists() or (root / "cmdline-tools").exists():
			return root.resolve()
	return None


def candidate_tool_paths(sdk_root: pathlib.Path | None, relative_parts: Sequence[str]) -> list[pathlib.Path]:
	candidates: list[pathlib.Path] = []
	suffix = ".exe" if IS_WINDOWS else ""

	if sdk_root:
		path = sdk_root.joinpath(*relative_parts)
		if suffix and path.suffix != suffix:
			path = path.with_suffix(suffix)
		candidates.append(path)

		if relative_parts[:1] == ("cmdline-tools",):
			cmdline_root = sdk_root / "cmdline-tools"
			if cmdline_root.exists():
				for child in sorted(cmdline_root.iterdir()):
					path = child.joinpath(*relative_parts[1:])
					if suffix and path.suffix != suffix:
						path = path.with_suffix(suffix)
					candidates.append(path)

	return candidates


def find_tool(name: str, sdk_root: pathlib.Path | None, relative_parts: Sequence[str]) -> pathlib.Path | None:
	path = which(name)
	if path:
		return path
	for candidate in candidate_tool_paths(sdk_root, relative_parts):
		if candidate.exists():
			return candidate.resolve()
	return None


def java_major_from_home(home: pathlib.Path) -> int | None:
	java_bin = home / "bin" / ("java.exe" if IS_WINDOWS else "java")
	if not java_bin.exists():
		return None
	try:
		result = subprocess.run(
			[str(java_bin), "-version"],
			stdout=subprocess.PIPE,
			stderr=subprocess.STDOUT,
			text=True,
			check=False,
		)
	except OSError:
		return None
	match = re.search(r'version "([^"]+)"', result.stdout)
	if not match:
		return None
	version = match.group(1)
	major = version.split(".", 1)[0]
	if major == "1":
		parts = version.split(".")
		if len(parts) > 1:
			major = parts[1]
	try:
		return int(major)
	except ValueError:
		return None


def candidate_java_homes(required_major: int) -> list[pathlib.Path]:
	paths: list[pathlib.Path] = []
	value = os.environ.get("ANDROID_JAVA_HOME")
	if value:
		paths.append(pathlib.Path(value).expanduser())

	home = pathlib.Path.home()
	system_name = platform.system()

	if system_name == "Darwin":
		vm_root = home / "Library" / "Java" / "JavaVirtualMachines"
		if vm_root.exists():
			for child in sorted(vm_root.glob("*/Contents/Home")):
				paths.append(child)
		for root in [
			pathlib.Path("/Applications/Android Studio.app/Contents/jbr/Contents/Home"),
			pathlib.Path("/Applications/Android Studio Preview.app/Contents/jbr/Contents/Home"),
			home / "Applications" / "Android Studio.app" / "Contents" / "jbr" / "Contents" / "Home",
		]:
			if root.exists():
				paths.append(root)
	elif system_name == "Windows":
		for root in filter(None, [
			os.environ.get("LOCALAPPDATA"),
			os.environ.get("ProgramFiles"),
			os.environ.get("ProgramFiles(x86)"),
		]):
			base = pathlib.Path(root)
			paths.extend([
				base / "Programs" / "Android Studio" / "jbr",
				base / "Android" / "Android Studio" / "jbr",
				base / "Microsoft" / "jdk-17",
			])
		for base in [pathlib.Path("C:/Program Files/Java"), pathlib.Path("C:/Program Files/Eclipse Adoptium")]:
			if base.exists():
				for child in sorted(base.iterdir()):
					paths.append(child)
	else:
		for base in [
			pathlib.Path("/usr/lib/jvm"),
			pathlib.Path("/usr/lib64/jvm"),
			pathlib.Path("/opt/android-studio"),
			pathlib.Path("/usr/local/android-studio"),
			home / "android-studio",
			pathlib.Path("/snap/android-studio/current/android-studio"),
		]:
			if base.is_dir():
				if base.name == "android-studio":
					paths.append(base / "jbr")
				for child in sorted(base.iterdir()):
					paths.append(child)

	java = which("java")
	if java:
		paths.append(java.parent.parent)
	value = os.environ.get("JAVA_HOME")
	if value:
		paths.append(pathlib.Path(value).expanduser())

	seen: set[pathlib.Path] = set()
	ordered: list[pathlib.Path] = []
	for path in paths:
		try:
			resolved = path.resolve()
		except FileNotFoundError:
			continue
		if resolved in seen:
			continue
		seen.add(resolved)
		ordered.append(resolved)
	return ordered


def resolve_java_home(required_major: int, max_major: int | None = None) -> pathlib.Path | None:
	exact: list[pathlib.Path] = []
	newer: list[pathlib.Path] = []
	for home in candidate_java_homes(required_major):
		major = java_major_from_home(home)
		if major is None:
			continue
		if max_major is not None and major > max_major:
			continue
		if major == required_major:
			exact.append(home)
		elif major > required_major:
			newer.append(home)
	return (exact or newer or [None])[0]


def parse_gradle_version(version: str | None) -> tuple[int, ...] | None:
	if not version:
		return None
	parts = re.findall(r"\d+", version)
	return tuple(int(part) for part in parts) if parts else None


def gradle_supported_java_max(version: str | None) -> int | None:
	parsed = parse_gradle_version(version)
	if not parsed:
		return None
	compatibility = [
		((9, 4), 26),
		((9, 1), 25),
		((8, 14), 24),
		((8, 10), 23),
		((8, 8), 22),
		((8, 5), 21),
		((8, 3), 20),
		((7, 6), 19),
		((7, 5), 18),
		((7, 3), 17),
		((7, 0), 16),
		((6, 7), 15),
		((6, 3), 14),
		((6, 0), 13),
		((5, 4), 12),
		((5, 0), 11),
		((4, 7), 10),
		((4, 3), 9),
		((2, 0), 8),
	]
	for minimum, java_max in compatibility:
		if parsed >= minimum:
			return java_max
	return None


def parse_build_metadata(repo_root: pathlib.Path | None) -> BuildMetadata:
	metadata = BuildMetadata()
	if not repo_root:
		return metadata
	java_patterns = [
		re.compile(r"JavaVersion\.VERSION_((?:1_)?\d+)"),
		re.compile(r"JavaLanguageVersion\.of\((\d+)\)"),
		re.compile(r"jvmToolchain\((\d+)\)"),
	]
	java_hits: list[int] = []
	for path in iter_build_files(repo_root):
		text = file_text(path)
		if not text:
			continue
		if metadata.compile_sdk is None:
			match = re.search(r"compileSdk\s*=\s*(\d+)", text)
			if match:
				metadata.compile_sdk = int(match.group(1))
			else:
				match = re.search(r"compileSdkVersion\s+(\d+)", text)
				if match:
					metadata.compile_sdk = int(match.group(1))
		for pattern in java_patterns:
			for match in pattern.finditer(text):
				value = match.group(1)
				if value.startswith("1_"):
					value = value.split("_", 1)[1]
				java_hits.append(int(value))
	metadata.java_major = max(java_hits) if java_hits else None
	return metadata


def parse_settings_modules(repo_root: pathlib.Path | None) -> list[str]:
	if not repo_root:
		return []
	for name in ("settings.gradle.kts", "settings.gradle"):
		path = repo_root / name
		if not path.exists():
			continue
		try:
			text = path.read_text(encoding="utf-8", errors="ignore")
		except OSError:
			continue
		matches = re.findall(r"include\(([^)]+)\)", text)
		modules: list[str] = []
		for match in matches:
			for token in re.findall(r'"(:[^"]+)"|\'(:[^\']+)\'', match):
				module = token[0] or token[1]
				if module:
					modules.append(module)
		if modules:
			return modules
	return []


def module_dir(repo_root: pathlib.Path, module_name: str) -> pathlib.Path:
	if module_name == ":":
		return repo_root
	parts = [part for part in module_name.split(":") if part]
	return repo_root.joinpath(*parts)


def file_text(path: pathlib.Path) -> str | None:
	try:
		return path.read_text(encoding="utf-8", errors="ignore")
	except OSError:
		return None


def has_android_application_plugin(module_root: pathlib.Path) -> bool:
	for name in ("build.gradle.kts", "build.gradle"):
		path = module_root / name
		if not path.exists():
			continue
		text = file_text(path) or ""
		if any(pattern in text for pattern in [
			'id("com.android.application")',
			"id 'com.android.application'",
			'apply plugin: "com.android.application"',
			"apply plugin: 'com.android.application'",
			"alias(libs.plugins.android.application)",
		]):
			return True
	return False


def find_gradle_wrapper(repo_root: pathlib.Path | None) -> pathlib.Path | None:
	if not repo_root:
		return None
	names = ["gradlew.bat", "gradlew"] if IS_WINDOWS else ["gradlew", "gradlew.bat"]
	for name in names:
		path = repo_root / name
		if path.exists():
			return path.resolve()
	return None


def read_wrapper_distribution(repo_root: pathlib.Path | None) -> str | None:
	if not repo_root:
		return None
	path = repo_root / "gradle" / "wrapper" / "gradle-wrapper.properties"
	if not path.exists():
		return None
	try:
		text = path.read_text(encoding="utf-8", errors="ignore")
	except OSError:
		return None
	match = re.search(r"distributionUrl=.*?/gradle-([^-]+)-", text)
	return match.group(1) if match else None


def gradle_cache_contains(version: str | None) -> bool | None:
	if not version:
		return None
	gradle_root = pathlib.Path.home() / ".gradle" / "wrapper" / "dists"
	if not gradle_root.exists():
		return False
	return any(gradle_root.glob(f"gradle-{version}-*"))


def build_context(repo_root: pathlib.Path | None) -> ToolingContext:
	sdk_root = find_sdk_root()
	build_metadata = parse_build_metadata(repo_root)
	wrapper_version = read_wrapper_distribution(repo_root)
	gradle_java_max = gradle_supported_java_max(wrapper_version)
	compile_sdk = build_metadata.compile_sdk
	java_major = build_metadata.java_major or min(17, gradle_java_max or 17)
	java_home = resolve_java_home(java_major, gradle_java_max)
	return ToolingContext(
		repo_root=repo_root,
		sdk_root=sdk_root,
		java_home=java_home,
		adb=find_tool("adb", sdk_root, ("platform-tools", "adb")),
		emulator=find_tool("emulator", sdk_root, ("emulator", "emulator")),
		sdkmanager=find_tool("sdkmanager", sdk_root, ("cmdline-tools", "latest", "bin", "sdkmanager")),
		avdmanager=find_tool("avdmanager", sdk_root, ("cmdline-tools", "latest", "bin", "avdmanager")),
		gradle_wrapper=find_gradle_wrapper(repo_root),
		compile_sdk=compile_sdk,
		java_major=java_major,
	)


def sdk_has_platform_tools(sdk_root: pathlib.Path | None) -> bool:
	return bool(sdk_root and (sdk_root / "platform-tools" / ("adb.exe" if IS_WINDOWS else "adb")).exists())


def sdk_has_cmdline_tools(sdk_root: pathlib.Path | None) -> bool:
	if not sdk_root:
		return False
	for candidate in candidate_tool_paths(sdk_root, ("cmdline-tools", "latest", "bin", "sdkmanager")):
		if candidate.exists():
			return True
	return False


def sdk_status(sdk_root: pathlib.Path | None) -> str:
	if not sdk_root:
		return "missing"
	has_platform = sdk_has_platform_tools(sdk_root)
	has_cmdline = sdk_has_cmdline_tools(sdk_root)
	if has_platform and has_cmdline:
		return "complete"
	if has_platform or has_cmdline:
		return "incomplete"
	return "missing"


def gradle_probe_command(wrapper: pathlib.Path, task: str, java_home: pathlib.Path) -> list[str]:
	args = [
		"-q",
		"--console=plain",
		"--warning-mode",
		"all",
		f"-Dorg.gradle.java.home={java_home}",
		task,
	]
	if IS_WINDOWS and wrapper.name.endswith(".bat"):
		return ["cmd.exe", "/c", str(wrapper), *args]
	if not IS_WINDOWS and not os.access(wrapper, os.X_OK):
		return ["/bin/sh", str(wrapper), *args]
	return [str(wrapper), *args]


def gradle_probe_output(
	repo_root: pathlib.Path,
	wrapper: pathlib.Path | None,
	java_home: pathlib.Path | None,
	task: str,
) -> str | None:
	if not wrapper or not java_home:
		return None
	result = run_capture(
		gradle_probe_command(wrapper, task, java_home),
		cwd=repo_root,
		check=False,
	)
	if result.returncode != 0:
		return None
	return result.stdout


def gradle_project_modules(
	repo_root: pathlib.Path,
	wrapper: pathlib.Path | None,
	java_home: pathlib.Path | None,
) -> list[str]:
	output = gradle_probe_output(repo_root, wrapper, java_home, "projects")
	if not output:
		return []
	modules: list[str] = []
	for line in output.splitlines():
		match = re.search(r"Project '(:[^']+)'", line)
		if match:
			modules.append(match.group(1))
	seen: set[str] = set()
	ordered: list[str] = []
	for module in modules:
		if module in seen:
			continue
		seen.add(module)
		ordered.append(module)
	return ordered


def discover_modules(context: ToolingContext) -> list[str]:
	if not context.repo_root:
		return []
	modules = gradle_project_modules(context.repo_root, context.gradle_wrapper, context.java_home)
	if modules:
		return modules
	modules = parse_settings_modules(context.repo_root)
	if modules:
		return modules
	if any((context.repo_root / name).exists() for name in ("build.gradle", "build.gradle.kts")):
		return [":"]
	return []


def module_application_package(module_root: pathlib.Path) -> str | None:
	patterns = [
		re.compile(r"namespace\s*=\s*[\"']([^\"']+)[\"']"),
		re.compile(r"applicationId\s*=\s*[\"']([^\"']+)[\"']"),
		re.compile(r"applicationId\s+[\"']([^\"']+)[\"']"),
	]
	for name in ("build.gradle.kts", "build.gradle"):
		path = module_root / name
		text = file_text(path)
		if not text:
			continue
		for pattern in patterns:
			match = pattern.search(text)
			if match:
				return match.group(1)
	return None


def qualify_component_name(package_name: str | None, component_name: str | None) -> str | None:
	if not component_name:
		return None
	if component_name.startswith("."):
		return f"{package_name}{component_name}" if package_name else None
	if "." in component_name:
		return component_name
	if package_name:
		return f"{package_name}.{component_name}"
	return None


def manifest_launcher_components(manifest_path: pathlib.Path, fallback_package: str | None = None) -> list[str]:
	try:
		root = ET.fromstring(manifest_path.read_text(encoding="utf-8", errors="ignore"))
	except (OSError, ET.ParseError):
		return []
	package_name = root.attrib.get("package") or fallback_package
	launchers: list[str] = []
	application = root.find("application")
	if application is None:
		return []
	for tag in ("activity", "activity-alias"):
		for activity in application.findall(tag):
			component_name = qualify_component_name(package_name, activity.attrib.get(f"{ANDROID_NS}name"))
			if not component_name:
				continue
			for intent_filter in activity.findall("intent-filter"):
				has_main = any(
					action.attrib.get(f"{ANDROID_NS}name") == "android.intent.action.MAIN"
					for action in intent_filter.findall("action")
				)
				has_launcher = any(
					category.attrib.get(f"{ANDROID_NS}name") in {
						"android.intent.category.LAUNCHER",
						"android.intent.category.LEANBACK_LAUNCHER",
					}
					for category in intent_filter.findall("category")
				)
				if has_main and has_launcher and package_name:
					launchers.append(f"{package_name}/{component_name}")
					break
	seen: set[str] = set()
	ordered: list[str] = []
	for launcher in launchers:
		if launcher in seen:
			continue
		seen.add(launcher)
		ordered.append(launcher)
	return ordered


def discover_launchers(context: ToolingContext) -> list[str]:
	if not context.repo_root:
		return []
	launchers: list[str] = []
	for module_name in discover_modules(context):
		module_root = module_dir(context.repo_root, module_name)
		if module_name != ":" and not has_android_application_plugin(module_root):
			continue
		manifest = module_root / "src" / "main" / "AndroidManifest.xml"
		if manifest.exists():
			launchers.extend(manifest_launcher_components(manifest, module_application_package(module_root)))
	seen: set[str] = set()
	ordered: list[str] = []
	for launcher in launchers:
		if launcher in seen:
			continue
		seen.add(launcher)
		ordered.append(launcher)
	return ordered


def find_report_files(repo_root: pathlib.Path, module_names: Sequence[str]) -> list[pathlib.Path]:
	reports: list[pathlib.Path] = []
	for module_name in module_names:
		module_root = module_dir(repo_root, module_name)
		reports.extend(sorted((module_root / "build" / "reports").glob("lint-results-*.txt")))
		reports.extend(sorted((module_root / "build" / "reports").glob("lint-results-*.xml")))
		reports.extend(sorted((module_root / "build" / "reports").glob("lint-results-*.html")))
	problem_report = repo_root / "build" / "reports" / "problems" / "problems-report.html"
	if problem_report.exists():
		reports.append(problem_report)
	seen: set[pathlib.Path] = set()
	ordered: list[pathlib.Path] = []
	for report in reports:
		resolved = report.resolve()
		if resolved in seen or not report.exists():
			continue
		seen.add(resolved)
		ordered.append(report)
	return ordered


def run_and_stream(
	args: Sequence[str],
	*,
	cwd: pathlib.Path | None = None,
	env: dict[str, str] | None = None,
	log_path: pathlib.Path | None = None,
	check: bool = False,
) -> int:
	log_file = log_path.open("w", encoding="utf-8") if log_path else None
	try:
		process = subprocess.Popen(
			list(args),
			cwd=str(cwd) if cwd else None,
			env=env,
			stdout=subprocess.PIPE,
			stderr=subprocess.STDOUT,
			text=True,
			bufsize=1,
		)
	except OSError as exc:
		raise SystemExit(str(exc))

	assert process.stdout is not None
	for line in process.stdout:
		sys.stdout.write(line)
		if log_file:
			log_file.write(line)
	process.wait()
	if log_file:
		log_file.close()
	if check and process.returncode != 0:
		raise SystemExit(process.returncode)
	return process.returncode


def run_to_log(
	args: Sequence[str],
	*,
	cwd: pathlib.Path | None = None,
	env: dict[str, str] | None = None,
	log_path: pathlib.Path,
) -> int:
	with log_path.open("w", encoding="utf-8") as handle:
		result = subprocess.run(
			list(args),
			cwd=str(cwd) if cwd else None,
			env=env,
			stdout=handle,
			stderr=subprocess.STDOUT,
			text=True,
			check=False,
		)
	return result.returncode


def run_capture(args: Sequence[str], *, cwd: pathlib.Path | None = None, check: bool = True) -> subprocess.CompletedProcess[str]:
	result = subprocess.run(
		list(args),
		cwd=str(cwd) if cwd else None,
		stdout=subprocess.PIPE,
		stderr=subprocess.STDOUT,
		text=True,
		check=False,
	)
	if check and result.returncode != 0:
		raise SystemExit(result.stdout)
	return result


def adb_base(adb_path: pathlib.Path, serial: str | None) -> list[str]:
	base = [str(adb_path)]
	if serial:
		base.extend(["-s", serial])
	return base


def connected_devices(adb_path: pathlib.Path) -> list[str]:
	result = run_capture([str(adb_path), "devices"], check=False)
	devices: list[str] = []
	for line in result.stdout.splitlines():
		line = line.strip()
		if not line or line.startswith("List of devices attached"):
			continue
		serial, _, state = line.partition("\t")
		if state == "device":
			devices.append(serial)
	return devices


def connected_emulators(adb_path: pathlib.Path) -> list[str]:
	return [serial for serial in connected_devices(adb_path) if serial.startswith("emulator-")]


def emulator_avd_name(adb_path: pathlib.Path, serial: str) -> str | None:
	result = run_capture([str(adb_path), "-s", serial, "emu", "avd", "name"], check=False)
	if result.returncode != 0:
		return None
	lines = [line.strip() for line in result.stdout.splitlines() if line.strip() and line.strip() != "OK"]
	return lines[0] if lines else None


def wait_for_boot(adb_path: pathlib.Path, serial: str | None, timeout_s: float) -> None:
	base = adb_base(adb_path, serial)
	run_capture(base + ["wait-for-device"])
	deadline = time.monotonic() + timeout_s
	while time.monotonic() < deadline:
		result = run_capture(base + ["shell", "getprop", "sys.boot_completed"], check=False)
		if result.stdout.replace("\r", "").strip() == "1":
			return
		time.sleep(1)
	raise SystemExit("Timed out waiting for Android device boot completion.")


def write_text(path: pathlib.Path, text: str) -> None:
	path.write_text(text, encoding="utf-8")


def dump_hierarchy_xml(adb_path: pathlib.Path, serial: str | None) -> str:
	base = adb_base(adb_path, serial)
	ui_dump = run_capture(base + ["exec-out", "uiautomator", "dump", "/dev/tty"], check=False)
	if ui_dump.returncode != 0:
		raise SystemExit(f"uiautomator dump failed:\n{ui_dump.stdout}")
	xml_text = ui_dump.stdout
	if not xml_text.strip():
		raise SystemExit("uiautomator dump returned an empty hierarchy.")
	start = xml_text.find("<?xml")
	end = xml_text.rfind("</hierarchy>")
	if start != -1 and end != -1:
		xml_text = xml_text[start : end + len("</hierarchy>")]
	return xml_text


def bounds_center(bounds: str | None) -> tuple[int, int] | None:
	if not bounds:
		return None
	match = re.fullmatch(r"\[(\d+),(\d+)\]\[(\d+),(\d+)\]", bounds)
	if not match:
		return None
	left, top, right, bottom = (int(value) for value in match.groups())
	return ((left + right) // 2, (top + bottom) // 2)


def tap_target_from_tree(node: ET.Element, attr: str, value: str, ancestors: list[ET.Element]) -> tuple[int, int] | None:
	if node.attrib.get(attr) == value:
		for candidate in [node, *reversed(ancestors)]:
			if candidate.attrib.get("enabled", "true") != "true":
				continue
			if candidate.attrib.get("clickable") == "true":
				center = bounds_center(candidate.attrib.get("bounds"))
				if center:
					return center
		center = bounds_center(node.attrib.get("bounds"))
		if center:
			return center
	for child in node:
		target = tap_target_from_tree(child, attr, value, ancestors + [node])
		if target:
			return target
	return None


def resolve_tap_target(adb_path: pathlib.Path, serial: str | None, attr: str, value: str, timeout_s: float = 15.0) -> tuple[int, int]:
	deadline = time.monotonic() + timeout_s
	last_error = f"Could not find a tap target for {attr}={value!r}."
	while time.monotonic() < deadline:
		try:
			xml_text = dump_hierarchy_xml(adb_path, serial)
			root = ET.fromstring(xml_text)
		except (ET.ParseError, SystemExit) as exc:
			last_error = str(exc)
			time.sleep(0.5)
			continue
		target = tap_target_from_tree(root, attr, value, [])
		if target:
			return target
		last_error = f"Could not find a tap target for {attr}={value!r}."
		time.sleep(0.5)
	raise SystemExit(last_error)


def action_capture(
	adb_path: pathlib.Path,
	serial: str | None,
	out_dir: pathlib.Path,
	*,
	wait_boot: bool,
	include_hierarchy: bool,
	include_dumpsys: bool,
	include_logcat: bool,
	logcat_lines: int,
) -> None:
	base = adb_base(adb_path, serial)
	out_dir.mkdir(parents=True, exist_ok=True)
	if wait_boot:
		wait_for_boot(adb_path, serial, 120)

	boot = run_capture(base + ["shell", "getprop", "sys.boot_completed"], check=False)
	write_text(out_dir / "boot_completed.txt", boot.stdout.replace("\r", ""))

	if include_dumpsys:
		activities = run_capture(base + ["shell", "dumpsys", "activity", "activities"], check=False)
		write_text(out_dir / "activity_activities.txt", activities.stdout)

		windows = run_capture(base + ["shell", "dumpsys", "window", "windows"], check=False)
		write_text(out_dir / "window_windows.txt", windows.stdout)

		match = re.search(r"^\s*(?:mResumedActivity|topResumedActivity)=.*$", activities.stdout, re.MULTILINE)
		write_text(out_dir / "top_activity.txt", f"{match.group(0)}\n" if match else "")

	if include_hierarchy:
		ui_dump = run_capture(base + ["shell", "uiautomator", "dump", "/sdcard/window_dump.xml"], check=False)
		if ui_dump.returncode == 0:
			run_capture(base + ["pull", "/sdcard/window_dump.xml", str(out_dir / "hierarchy.xml")], check=False)
			run_capture(base + ["shell", "rm", "/sdcard/window_dump.xml"], check=False)

	with (out_dir / "screen.png").open("wb") as handle:
		subprocess.run(base + ["exec-out", "screencap", "-p"], check=False, stdout=handle)

	if include_logcat:
		logcat = run_capture(base + ["logcat", "-d", "-v", "threadtime", "-t", str(logcat_lines)], check=False)
		write_text(out_dir / "logcat.txt", logcat.stdout)

	stdout(f"Wrote capture bundle to {out_dir}")
	for child in sorted(out_dir.iterdir()):
		if child.is_file():
			stdout(str(child))


def default_gradle_tasks(context: ToolingContext) -> list[str]:
	if not context.repo_root:
		return ["assembleDebug", "lintDebug"]
	for module_name in discover_modules(context):
		module_root = module_dir(context.repo_root, module_name)
		if module_name == ":" or has_android_application_plugin(module_root):
			prefix = "" if module_name == ":" else module_name
			return [f"{prefix}:assembleDebug" if prefix else "assembleDebug", f"{prefix}:lintDebug" if prefix else "lintDebug"]

	app_module = (context.repo_root / "app" / "build.gradle").exists() or (context.repo_root / "app" / "build.gradle.kts").exists()
	if app_module:
		return [":app:assembleDebug", ":app:lintDebug"]
	return ["assembleDebug", "lintDebug"]


def summarize_build_log(log_text: str) -> list[str]:
	patterns = [
		re.compile(r"SDK XML version .*?only understands up to .*", re.IGNORECASE),
		re.compile(r"Mapping new ns .*? to old ns .*?", re.IGNORECASE),
		re.compile(r"unexpected element .*?abis", re.IGNORECASE),
	]
	summaries: list[str] = []
	for line in log_text.splitlines():
		for pattern in patterns:
			if pattern.search(line):
				summaries.append(line.strip())
				break
	return summaries[:5]


def gradle_command(wrapper: pathlib.Path, tasks: Sequence[str], java_home: pathlib.Path) -> list[str]:
	args = [
		"--no-daemon",
		"--no-configuration-cache",
		"--console=plain",
		"--warning-mode",
		"all",
		f"-Dorg.gradle.java.home={java_home}",
		*tasks,
	]
	if IS_WINDOWS and wrapper.name.endswith(".bat"):
		return ["cmd.exe", "/c", str(wrapper), *args]
	if not IS_WINDOWS and not os.access(wrapper, os.X_OK):
		return ["/bin/sh", str(wrapper), *args]
	return [str(wrapper), *args]


def detect_build_tools_package(compile_sdk: int | None) -> str | None:
	return f"build-tools;{compile_sdk}.0.0" if compile_sdk else None


def default_system_image(compile_sdk: int | None) -> str | None:
	if not compile_sdk:
		return None
	arch = platform.machine().lower()
	image_arch = "arm64-v8a" if arch in {"arm64", "aarch64"} else "x86_64"
	return f"system-images;android-{compile_sdk};google_apis;{image_arch}"


def list_avds(emulator_path: pathlib.Path | None) -> list[str]:
	if not emulator_path:
		return []
	result = run_capture([str(emulator_path), "-list-avds"], check=False)
	valid = [
		line.strip()
		for line in result.stdout.splitlines()
		if re.fullmatch(r"[A-Za-z0-9._-]+", line.strip())
	]
	if valid:
		return valid
	avd_dir = pathlib.Path.home() / ".android" / "avd"
	if avd_dir.exists():
		return sorted(path.stem for path in avd_dir.glob("*.ini"))
	return []


def create_avd(context: ToolingContext, name: str, package: str) -> None:
	if not context.avdmanager:
		raise SystemExit("avdmanager not found. Install Android SDK Command-Line Tools first.")
	command = [str(context.avdmanager), "create", "avd", "-n", name, "-k", package, "-f"]
	result = run_capture(command, check=False)
	if result.returncode != 0 and "already exists" not in result.stdout.lower():
		raise SystemExit(result.stdout)
	stdout(result.stdout.strip())


def start_emulator(args: argparse.Namespace, context: ToolingContext) -> None:
	if not context.emulator:
		raise SystemExit("emulator not found. Install the Android Emulator package first.")
	avd_name = args.avd or (list_avds(context.emulator)[0] if list_avds(context.emulator) else None)
	if not avd_name:
		raise SystemExit("No AVD found. Create one with avdmanager or Android Studio.")
	if context.adb:
		for serial in connected_emulators(context.adb):
			if emulator_avd_name(context.adb, serial) == avd_name:
				stdout(f"AVD {avd_name} is already running as {serial}")
				if args.wait_boot:
					wait_for_boot(context.adb, serial, args.timeout)
					stdout(f"Boot completed for {serial}")
				return
	out_dir = temp_dir_for("emulator", args.out_dir)
	command = [str(context.emulator), "-avd", avd_name]
	if args.port:
		command += ["-port", str(args.port)]
	if args.no_window:
		command.append("-no-window")
	if args.no_snapshot:
		command.append("-no-snapshot")
	if args.wipe_data:
		command.append("-wipe-data")
	command += ["-netdelay", "none", "-netspeed", "full"]

	stdout_log = (out_dir / "emulator-stdout.log").open("w", encoding="utf-8")
	stderr_log = (out_dir / "emulator-stderr.log").open("w", encoding="utf-8")
	creationflags = 0
	start_new_session = False
	if IS_WINDOWS:
		creationflags = subprocess.CREATE_NEW_PROCESS_GROUP | subprocess.DETACHED_PROCESS
	else:
		start_new_session = True
	process = subprocess.Popen(
		command,
		stdout=stdout_log,
		stderr=stderr_log,
		start_new_session=start_new_session,
		creationflags=creationflags,
	)
	stdout(f"Started emulator pid={process.pid}")
	stdout(f"Logs: {out_dir}")
	if args.wait_boot:
		serial = f"emulator-{args.port or 5554}"
		if not context.adb:
			raise SystemExit("adb not found. Install platform-tools first.")
		wait_for_boot(context.adb, serial, args.timeout)
		stdout(f"Boot completed for {serial}")


def console_auth_token() -> str:
	path = pathlib.Path.home() / ".emulator_console_auth_token"
	try:
		return path.read_text(encoding="utf-8").strip()
	except OSError as exc:
		raise SystemExit(f"Could not read emulator console token from {path}: {exc}")


def send_console_commands(port: int, commands: Sequence[str]) -> str:
	buffer = bytearray()
	with socket.create_connection(("127.0.0.1", port), timeout=5) as conn:
		conn.settimeout(5)
		token = console_auth_token()
		def recv_until_ok() -> str:
			chunks: list[bytes] = []
			while True:
				chunk = conn.recv(4096)
				if not chunk:
					break
				chunks.append(chunk)
				joined = b"".join(chunks)
				if joined.rstrip().endswith(b"OK") or b"KO:" in joined:
					return joined.decode("utf-8", errors="replace")
			return b"".join(chunks).decode("utf-8", errors="replace")

		buffer.extend(recv_until_ok().encode("utf-8"))
		conn.sendall(f"auth {token}\n".encode("utf-8"))
		buffer.extend(recv_until_ok().encode("utf-8"))
		for command in commands:
			conn.sendall(f"{command}\n".encode("utf-8"))
			buffer.extend(recv_until_ok().encode("utf-8"))
		conn.sendall(b"exit\n")
	return buffer.decode("utf-8", errors="replace")


def console_port_from_serial(serial: str) -> int:
	match = re.fullmatch(r"emulator-(\d+)", serial)
	if not match:
		raise SystemExit("Emulator console commands require an emulator serial such as emulator-5554.")
	return int(match.group(1))


def do_ui_sequence(args: argparse.Namespace, context: ToolingContext) -> None:
	if not context.adb:
		raise SystemExit("adb not found. Install platform-tools first.")
	if args.serial:
		devices = connected_devices(context.adb)
		if args.serial not in devices:
			raise SystemExit(f"Device serial not found: {args.serial}. Connected devices: {', '.join(devices) if devices else 'none'}")
	base = adb_base(context.adb, args.serial)
	steps = list(args.steps)
	if steps[:1] == ["--"]:
		steps = steps[1:]
	if not steps:
		raise SystemExit("Provide one or more steps, for example: tap 100 200 sleep 1 capture")

	index = 0
	while index < len(steps):
		action = steps[index]
		stdout(f"ui-sequence: {action}")
		if action == "tap":
			x, y = steps[index + 1 : index + 3]
			stdout(f"  tap {x} {y}")
			run_capture(base + ["shell", "input", "tap", x, y])
			index += 3
		elif action == "tap-text":
			value = steps[index + 1]
			x, y = resolve_tap_target(context.adb, args.serial, "text", value)
			stdout(f"  tap-text {value!r} -> {x} {y}")
			run_capture(base + ["shell", "input", "tap", str(x), str(y)])
			index += 2
		elif action == "tap-desc":
			value = steps[index + 1]
			x, y = resolve_tap_target(context.adb, args.serial, "content-desc", value)
			stdout(f"  tap-desc {value!r} -> {x} {y}")
			run_capture(base + ["shell", "input", "tap", str(x), str(y)])
			index += 2
		elif action == "tap-id":
			value = steps[index + 1]
			x, y = resolve_tap_target(context.adb, args.serial, "resource-id", value)
			stdout(f"  tap-id {value!r} -> {x} {y}")
			run_capture(base + ["shell", "input", "tap", str(x), str(y)])
			index += 2
		elif action == "swipe":
			x1, y1, x2, y2, duration = steps[index + 1 : index + 6]
			stdout(f"  swipe {x1} {y1} {x2} {y2} {duration}")
			run_capture(base + ["shell", "input", "swipe", x1, y1, x2, y2, duration])
			index += 6
		elif action == "text":
			value = steps[index + 1]
			stdout(f"  text {value}")
			run_capture(base + ["shell", "input", "text", value])
			index += 2
		elif action == "key":
			keycode = steps[index + 1]
			stdout(f"  key {keycode}")
			run_capture(base + ["shell", "input", "keyevent", keycode])
			index += 2
		elif action == "sleep":
			duration = float(steps[index + 1])
			stdout(f"  sleep {duration}")
			time.sleep(duration)
			index += 2
		elif action == "start":
			component = steps[index + 1]
			stdout(f"  start {component}")
			run_capture(base + ["shell", "am", "start", "-W", "-n", component])
			index += 2
		elif action == "install":
			apk_path = steps[index + 1]
			stdout(f"  install {apk_path}")
			run_capture(base + ["install", "-r", apk_path])
			index += 2
		elif action == "uninstall":
			package = steps[index + 1]
			stdout(f"  uninstall {package}")
			run_capture(base + ["uninstall", package], check=False)
			index += 2
		elif action == "force-stop":
			package = steps[index + 1]
			stdout(f"  force-stop {package}")
			run_capture(base + ["shell", "am", "force-stop", package])
			index += 2
		elif action == "grant":
			package, permission = steps[index + 1 : index + 3]
			stdout(f"  grant {package} {permission}")
			run_capture(base + ["shell", "pm", "grant", package, permission])
			index += 3
		elif action == "logcat-clear":
			stdout("  logcat -c")
			run_capture(base + ["logcat", "-c"])
			index += 1
		elif action == "capture":
			out_dir = temp_dir_for("capture", args.out_dir)
			stdout(f"  capture -> {out_dir}")
			action_capture(
				context.adb,
				args.serial,
				out_dir,
				wait_boot=False,
				include_hierarchy=True,
				include_dumpsys=True,
				include_logcat=True,
				logcat_lines=200,
			)
			index += 1
		else:
			raise SystemExit(f"Unknown ui-sequence action: {action}")


def do_doctor(args: argparse.Namespace, context: ToolingContext) -> None:
	stdout(f"Platform: {platform.system()} {platform.release()} ({platform.machine()})")
	stdout(f"Repo: {context.repo_root or '(not set)'}")
	stdout(f"Compile SDK: {context.compile_sdk or 'unknown'}")
	stdout(f"Required Java: {context.java_major}")
	stdout(f"JAVA_HOME: {context.java_home or 'missing'}")
	stdout(f"SDK root: {context.sdk_root or 'missing'}")
	stdout(f"SDK status: {sdk_status(context.sdk_root)}")
	stdout(f"adb: {context.adb or 'missing'}")
	stdout(f"emulator: {context.emulator or 'missing'}")
	stdout(f"sdkmanager: {context.sdkmanager or 'missing'}")
	stdout(f"avdmanager: {context.avdmanager or 'missing'}")
	stdout(f"Gradle wrapper: {context.gradle_wrapper or 'missing'}")
	if context.repo_root:
		stdout(f"Default tasks: {' '.join(default_gradle_tasks(context))}")
		modules = discover_modules(context)
		stdout(f"Modules: {', '.join(modules) if modules else 'unknown'}")
		launchers = discover_launchers(context)
		stdout(f"Launchers: {', '.join(launchers) if launchers else 'none found'}")
		wrapper_version = read_wrapper_distribution(context.repo_root)
		stdout(f"Gradle wrapper version: {wrapper_version or 'unknown'}")
		gradle_java_max = gradle_supported_java_max(wrapper_version)
		if gradle_java_max is not None:
			stdout(f"Gradle wrapper Java max: {gradle_java_max}")
		cached = gradle_cache_contains(wrapper_version)
		if cached is not None:
			stdout(f"Gradle wrapper cached: {'yes' if cached else 'no'}")
	if context.adb:
		devices = connected_devices(context.adb)
		stdout(f"Connected devices: {', '.join(devices) if devices else 'none'}")
	avds = list_avds(context.emulator)
	stdout(f"AVDs: {', '.join(avds) if avds else 'none found'}")

	if args.install_sdk:
		if not context.sdkmanager or not context.sdk_root:
			raise SystemExit(
				"sdkmanager not found. Install the Android SDK Command-Line Tools in <sdk>/cmdline-tools/latest first."
			)
		packages = ["platform-tools"]
		if context.compile_sdk:
			packages.append(f"platforms;android-{context.compile_sdk}")
			build_tools = detect_build_tools_package(context.compile_sdk)
			if build_tools:
				packages.append(build_tools)
		if args.with_emulator:
			packages.append("emulator")
			image = args.system_image or default_system_image(context.compile_sdk)
			if image:
				packages.append(image)
		command = [str(context.sdkmanager), f"--sdk_root={context.sdk_root}", *packages]
		stdout("Installing SDK packages:")
		for package in packages:
			stdout(f"  {package}")
		run_and_stream(command, check=True)
		if args.accept_licenses:
			run_and_stream([str(context.sdkmanager), f"--sdk_root={context.sdk_root}", "--licenses"], check=True)
	if args.create_avd:
		image = args.system_image or default_system_image(context.compile_sdk)
		if not image:
			raise SystemExit("Could not determine a default system image. Pass --system-image explicitly.")
		create_avd(context, args.create_avd, image)

	if not context.sdkmanager:
		stdout("Setup note: sdkmanager/avdmanager are missing. Official SDK command-line tools belong under <sdk>/cmdline-tools/latest/bin.")
		stdout("Official guidance: https://developer.android.com/tools/sdkmanager")
	if sdk_status(context.sdk_root) == "incomplete":
		stdout("Setup note: SDK root was found but is incomplete. Install both platform-tools and Command-Line Tools.")
	if context.repo_root:
		wrapper_version = read_wrapper_distribution(context.repo_root)
		gradle_java_max = gradle_supported_java_max(wrapper_version)
		if gradle_java_max is not None and context.java_home is None:
			stdout(f"Setup note: no compatible JAVA_HOME was found for this wrapper. Gradle {wrapper_version} supports up to Java {gradle_java_max}.")
	if context.repo_root and gradle_cache_contains(read_wrapper_distribution(context.repo_root)) is False:
		stdout("Fresh clone note: the first Gradle wrapper run downloads its distribution if it is not already cached.")


def do_build_lint(args: argparse.Namespace, context: ToolingContext) -> None:
	if not context.repo_root or not context.gradle_wrapper:
		raise SystemExit("Gradle wrapper not found. Run this command in an Android repo or pass --repo.")
	if not context.java_home:
		wrapper_version = read_wrapper_distribution(context.repo_root)
		gradle_java_max = gradle_supported_java_max(wrapper_version)
		if gradle_java_max is not None:
			raise SystemExit(
				f"Could not resolve JAVA_HOME for Java {context.java_major}+ compatible with Gradle {wrapper_version} (max Java {gradle_java_max})."
			)
		raise SystemExit(f"Could not resolve JAVA_HOME for Java {context.java_major}+.")
	out_dir = temp_dir_for("build", args.out_dir)
	log_path = out_dir / "gradle-build-lint.log"
	tasks = args.tasks or default_gradle_tasks(context)
	env = os.environ.copy()
	env["JAVA_HOME"] = str(context.java_home)
	stdout(f"JAVA_HOME={context.java_home}")
	stdout(f"Tasks={' '.join(tasks)}")
	command = gradle_command(context.gradle_wrapper, tasks, context.java_home)
	if args.stream:
		code = run_and_stream(command, cwd=context.repo_root, env=env, log_path=log_path)
	else:
		code = run_to_log(command, cwd=context.repo_root, env=env, log_path=log_path)
	stdout(f"Saved console output to {log_path}")
	if not args.stream:
		stdout("Tip: add --stream when interactive full Gradle output is required.")
	log_text = file_text(log_path) or ""
	for warning in summarize_build_log(log_text):
		stdout(f"Environment warning: {warning}")
	for report in find_report_files(context.repo_root, discover_modules(context) or [":"]):
		stdout(f"Report: {report}")
	raise SystemExit(code)


def do_capture(args: argparse.Namespace, context: ToolingContext) -> None:
	if not context.adb:
		raise SystemExit("adb not found. Install platform-tools first.")
	if args.serial:
		devices = connected_devices(context.adb)
		if args.serial not in devices:
			raise SystemExit(f"Device serial not found: {args.serial}. Connected devices: {', '.join(devices) if devices else 'none'}")
	out_dir = temp_dir_for("capture", args.out_dir)
	action_capture(
		context.adb,
		args.serial,
		out_dir,
		wait_boot=not args.no_wait_boot,
		include_hierarchy=not args.skip_hierarchy,
		include_dumpsys=not args.skip_dumpsys,
		include_logcat=not args.skip_logcat,
		logcat_lines=args.logcat_lines,
	)


def do_emu_console(args: argparse.Namespace, _context: ToolingContext) -> None:
	commands: list[str] = list(args.console_commands)
	if args.geo:
		commands.append(f"geo fix {args.geo[0]} {args.geo[1]}")
	if args.acceleration:
		commands.append(f"sensor set acceleration {args.acceleration[0]}:{args.acceleration[1]}:{args.acceleration[2]}")
	if args.power_capacity is not None:
		commands.append(f"power capacity {args.power_capacity}")
	if args.power_status:
		commands.append(f"power status {args.power_status}")
	if args.network_delay:
		commands.append(f"network delay {args.network_delay}")
	if args.network_speed:
		commands.append(f"network speed {args.network_speed}")
	if not commands:
		raise SystemExit("Provide one or more --command values or convenience flags.")
	port = args.port or (console_port_from_serial(args.serial) if args.serial else None)
	if not port:
		raise SystemExit("Provide --port or --serial emulator-5554.")
	stdout(send_console_commands(port, commands).rstrip())


def parse_args() -> argparse.Namespace:
	def add_repo_argument(target: argparse.ArgumentParser) -> None:
		target.add_argument("--repo", help="Android repo root. Defaults to the current working directory.")

	parser = argparse.ArgumentParser(
		description="Cross-platform Android repo helper for Codex skills.",
		epilog=(
			"Recommended start:\n"
			"  android_tooling.py doctor --repo /path/to/repo\n\n"
			"Use '<subcommand> --help' for command-specific flags and examples."
		),
		formatter_class=argparse.RawDescriptionHelpFormatter,
	)
	add_repo_argument(parser)
	subparsers = parser.add_subparsers(dest="subcommand", required=True)

	doctor = subparsers.add_parser(
		"doctor",
		help="Inspect Android tooling and optionally install SDK packages or create an AVD.",
		description="Inspect Android tooling, Gradle wrapper details, modules, launchers, devices, and AVDs.",
		epilog=(
			"Examples:\n"
			"  android_tooling.py doctor --repo /path/to/repo\n"
			"  android_tooling.py doctor --repo /path/to/repo --install-sdk --with-emulator\n"
			"  android_tooling.py doctor --repo /path/to/repo --create-avd Pixel_9_Pro"
		),
		formatter_class=argparse.RawDescriptionHelpFormatter,
	)
	add_repo_argument(doctor)
	doctor.add_argument("--install-sdk", action="store_true", help="Install standard SDK packages if sdkmanager is available.")
	doctor.add_argument("--with-emulator", action="store_true", help="Include emulator and a default system image when installing SDK packages.")
	doctor.add_argument("--accept-licenses", action="store_true", help="Run sdkmanager --licenses after installing packages.")
	doctor.add_argument("--system-image", help="Override the default system image package.")
	doctor.add_argument("--create-avd", help="Create an AVD with the given name after ensuring the system image is available.")

	build_lint = subparsers.add_parser(
		"build-lint",
		help="Resolve Java, then run assembleDebug and lintDebug.",
		description="Run Gradle build and lint with a compatible JAVA_HOME and concise output by default.",
		epilog=(
			"Examples:\n"
			"  android_tooling.py build-lint --repo /path/to/repo\n"
			"  android_tooling.py build-lint --repo /path/to/repo --stream\n"
			"  android_tooling.py build-lint --repo /path/to/repo :app:assembleDebug :app:lintDebug"
		),
		formatter_class=argparse.RawDescriptionHelpFormatter,
	)
	add_repo_argument(build_lint)
	build_lint.add_argument("--out-dir", help="Directory for the combined console log. Defaults to an OS temp directory.")
	build_lint.add_argument("--stream", action="store_true", help="Stream full Gradle output to stdout. By default output is written only to the log file.")
	build_lint.add_argument("tasks", nargs="*", help="Override Gradle tasks.")

	capture = subparsers.add_parser(
		"capture",
		help="Capture screenshot, UI hierarchy, activity state, window state, and logcat.",
		description="Capture a compact or full device-state bundle for visual debugging.",
		epilog=(
			"Examples:\n"
			"  android_tooling.py capture --serial emulator-5556\n"
			"  android_tooling.py capture --serial emulator-5556 --skip-hierarchy --skip-dumpsys --skip-logcat\n"
			"  android_tooling.py capture --serial emulator-5556 --logcat-lines 50"
		),
		formatter_class=argparse.RawDescriptionHelpFormatter,
	)
	add_repo_argument(capture)
	capture.add_argument("--serial", help="adb device serial.")
	capture.add_argument("--out-dir", help="Output directory. Defaults to an OS temp directory.")
	capture.add_argument("--no-wait-boot", action="store_true", help="Skip waiting for sys.boot_completed.")
	capture.add_argument("--skip-hierarchy", action="store_true", help="Skip UI hierarchy dump.")
	capture.add_argument("--skip-dumpsys", action="store_true", help="Skip activity/window dumpsys output.")
	capture.add_argument("--skip-logcat", action="store_true", help="Skip logcat capture.")
	capture.add_argument("--logcat-lines", type=int, default=200, help="Maximum number of recent logcat lines to capture.")

	ui = subparsers.add_parser(
		"ui-sequence",
		help="Batch adb UI actions to reduce repeated approvals.",
		description="Run a sequence of install, launch, input, and capture actions on one device.",
		epilog=(
			"Supported actions:\n"
			"  install APK_PATH\n"
			"  uninstall PACKAGE\n"
			"  start PACKAGE/ACTIVITY\n"
			"  force-stop PACKAGE\n"
			"  tap X Y\n"
			"  tap-text LABEL\n"
			"  tap-desc DESCRIPTION\n"
			"  tap-id PACKAGE:ID/VIEW\n"
			"  swipe X1 Y1 X2 Y2 DURATION_MS\n"
			"  text VALUE\n"
			"  key KEYCODE_BACK\n"
			"  grant PACKAGE PERMISSION\n"
			"  logcat-clear\n"
			"  sleep SECONDS\n"
			"  capture\n\n"
			"Examples:\n"
			"  android_tooling.py ui-sequence --serial emulator-5556 -- install /tmp/app.apk start com.example/.MainActivity sleep 2 capture\n"
			"  android_tooling.py ui-sequence --serial emulator-5556 -- tap-text \"New Game\" sleep 1 capture"
		),
		formatter_class=argparse.RawDescriptionHelpFormatter,
	)
	add_repo_argument(ui)
	ui.add_argument("--serial", help="adb device serial.")
	ui.add_argument("--out-dir", help="Capture directory if the sequence includes a capture action.")
	ui.add_argument("steps", nargs=argparse.REMAINDER, help="Actions: install apk | uninstall package | tap x y | tap-text 'Label' | tap-desc 'Description' | tap-id package:id/view | swipe x1 y1 x2 y2 duration | text value | key KEYCODE_BACK | sleep 1 | start package/activity | force-stop package | grant package permission | logcat-clear | capture")

	start = subparsers.add_parser(
		"start-emulator",
		help="Launch an emulator from an existing AVD.",
		description="Start an Android emulator from an existing AVD, optionally waiting for boot.",
		epilog=(
			"Examples:\n"
			"  android_tooling.py start-emulator --avd Pixel_9_Pro --port 5556 --wait-boot\n"
			"  android_tooling.py start-emulator --avd Pixel_9_Pro --no-window --no-snapshot"
		),
		formatter_class=argparse.RawDescriptionHelpFormatter,
	)
	add_repo_argument(start)
	start.add_argument("--avd", help="AVD name. Defaults to the first available AVD.")
	start.add_argument("--port", type=int, help="Even console port, such as 5554 or 5556.")
	start.add_argument("--no-window", action="store_true", help="Run the emulator headlessly.")
	start.add_argument("--no-snapshot", action="store_true", help="Disable snapshot load/save.")
	start.add_argument("--wipe-data", action="store_true", help="Reset emulator data before boot.")
	start.add_argument("--wait-boot", action="store_true", help="Wait for sys.boot_completed.")
	start.add_argument("--timeout", type=float, default=300.0, help="Boot wait timeout in seconds.")
	start.add_argument("--out-dir", help="Directory for emulator stdout/stderr logs.")

	console = subparsers.add_parser(
		"emu-console",
		help="Send Android Emulator console commands without a telnet dependency.",
		description="Send raw or convenience emulator console commands for power, network, geo, and sensor simulation.",
		epilog=(
			"Examples:\n"
			"  android_tooling.py emu-console --serial emulator-5556 --power-capacity 15 --power-status discharging\n"
			"  android_tooling.py emu-console --serial emulator-5556 --geo 13.4050 52.5200\n"
			"  android_tooling.py emu-console --serial emulator-5556 --command 'network speed full'"
		),
		formatter_class=argparse.RawDescriptionHelpFormatter,
	)
	add_repo_argument(console)
	console.add_argument("--serial", help="Emulator serial such as emulator-5554.")
	console.add_argument("--port", type=int, help="Emulator console port, such as 5554.")
	console.add_argument("--command", dest="console_commands", action="append", default=[], help="Raw emulator console command. Repeat as needed.")
	console.add_argument("--geo", nargs=2, metavar=("LONGITUDE", "LATITUDE"), help="Send a geo fix.")
	console.add_argument("--acceleration", nargs=3, metavar=("X", "Y", "Z"), help="Set acceleration sensor values.")
	console.add_argument("--power-capacity", type=int, help="Set emulator battery capacity percent.")
	console.add_argument("--power-status", help="Set power status, for example charging or discharging.")
	console.add_argument("--network-delay", help="Set network delay, for example none or gprs.")
	console.add_argument("--network-speed", help="Set network speed, for example full or lte.")

	return parser.parse_args()


def main() -> None:
	args = parse_args()
	repo_arg = getattr(args, "repo", None) or os.getcwd()
	repo_root = pathlib.Path(repo_arg).expanduser().resolve() if repo_arg else None
	if repo_root and not repo_root.exists():
		repo_root = None
	context = build_context(repo_root)

	if args.subcommand == "doctor":
		do_doctor(args, context)
	elif args.subcommand == "build-lint":
		do_build_lint(args, context)
	elif args.subcommand == "capture":
		do_capture(args, context)
	elif args.subcommand == "ui-sequence":
		do_ui_sequence(args, context)
	elif args.subcommand == "start-emulator":
		start_emulator(args, context)
	elif args.subcommand == "emu-console":
		do_emu_console(args, context)
	else:
		raise SystemExit(f"Unknown command: {args.subcommand}")


if __name__ == "__main__":
	main()
