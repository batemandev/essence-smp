from argparse import ArgumentParser, Namespace
from typing import Tuple, Iterator
import logging
import sys
import glob
import os
import commentjson
import zipfile
import gitfiles
import lark
import time
import json
import shutil

gitfiles.load_gitignore()

logging.basicConfig(
    format="[%(asctime)s] [%(name)s/%(levelname)s]: %(message)s",
    datefmt="%I:%M:%S",
    handlers=[logging.StreamHandler(sys.stdout)],
    level=logging.INFO,
)
log = logging.getLogger("mcaddon")


def type_abbr(type: str) -> str:
    if type is None:
        return "PACK"
    
    match type:
        case "behavior":
            return "BP"
        case "resource":
            return "RP"
        case "skin":
            return "SP"
        case _:
            return "PACK"


def pack_type(module_type: str) -> str:
    if module_type is None:
        return "behavior"
    
    match module_type:
        case "data":
            return "behavior"
        case "resources":
            return "resource"
        case "skin_pack":
            return "skin"
        case "script":
            return "behavior"
        case "client_data":
            return "behavior"
        case _:
            return "behavior"


def find_packs(dir: str, pack_filter: str = "all") -> Iterator[Tuple[str, dict[str, str]]]:
    root_dir = os.path.realpath(dir)
    for fn in glob.glob("**/manifest.json", root_dir=root_dir, recursive=True):
        if gitfiles.match(fn):
            continue
        fp = os.path.join(root_dir, fn)
        pack_dir = os.path.dirname(os.path.relpath(fp, root_dir))
        pack_metadata = {"uuid": None, "version": None, "type": None, "name": None, "abbr": None}
        try:
            with open(fp) as fd:
                data = commentjson.load(fd)
                pack_metadata["uuid"] = data["header"]["uuid"]
                pack_metadata["name"] = data["header"]["name"]
                pack_metadata["version"] = ".".join(
                    [str(x) for x in data["header"]["version"]]
                )
                
                if "metadata" in data and "abbr" in data["metadata"]:
                    pack_metadata["abbr"] = data["metadata"]["abbr"]
                
                for module in data["modules"]:
                    if module["type"] in ["data", "resources", "skin_pack", "script", "client_data"]:
                        pack_metadata["type"] = pack_type(module["type"])
                        break
                
                if pack_metadata["abbr"] is None:
                    pack_metadata["abbr"] = type_abbr(pack_metadata["type"])
                    
        except commentjson.JSONLibraryException as err:
            log.warning("Failed to load %s: %s", pack_dir, err.message)
            continue
        except KeyError as err:
            log.warning("Failed to load %s: %s", pack_dir, err)
            continue
        
        if pack_filter != "all" and pack_metadata["type"] != pack_filter:
            log.info("Skipping pack %s (type: %s, filter: %s)", pack_dir, pack_metadata["type"], pack_filter)
            continue
            
        log.info("Found pack: %s with metadata: %s", pack_dir, pack_metadata)
        yield pack_dir, pack_metadata


def artifact_name(args: Namespace, pack_dir: str, pack_metadata: dict[str, str]) -> str:
    name = args.outputPattern
    data = {"dirname": os.path.basename(pack_dir)}
    data.update(pack_metadata)
    for k, v in data.items():
        if v is not None:
            name = name.replace(k.upper(), str(v))
        else:
            name = name.replace(k.upper(), "")
    res = os.path.join(args.output, "libs", name)
    log.debug("\tGenerated artifact name: %s", res)
    return res


def compile_pack(args: Namespace, pack_dir: str, pack_metadata: dict[str, str]):
    start = time.time()
    fp = os.path.join(args.output, "tmp", pack_dir)
    zf = artifact_name(args, pack_dir, pack_metadata)
    with zipfile.ZipFile(zf, mode="w") as zip:
        log.debug("\tCreating zip file: %s", zf)
        content = {"content": []}
        for root, dirs, files in os.walk(fp):
            for f in files:
                file = os.path.join(root, f)
                with open(file, "rb") as fd:
                    data = fd.read()
                    if file.endswith((".json", ".jsonc", ".json5")):
                        try:
                            temp = commentjson.loads(data)
                            data = commentjson.dumps(temp)
                        except (
                            commentjson.JSONLibraryException,
                            ValueError,
                            lark.exceptions.UnexpectedToken,
                        ):
                            ...
                    name = os.path.relpath(file, fp)
                    content["content"].append({"path": name.replace("\\", "/")})
                    log.debug("\tAdding file to zip: %s", name)
                    zip.writestr(name, data)

        log.debug("\tWriting contents.json to zip")
        zip.writestr("contents.json", commentjson.dumps(content))

    log.info("\033[92mDone in %s ms\033[0m", round(time.time() - start, 2))


def build_script(fp: str, output: str):
    log.info("Executing build script: %s", fp)
    with open(fp) as fd:
        wdir = os.getcwd()
        script = (
            f"import os; os.chdir({ repr(os.path.join(output, 'tmp')) })\n{ fd.read() }"
        )
        exec_globals = {"log": logging.getLogger(os.path.basename(fp))}
        exec(script, exec_globals)
        if "build" in exec_globals:
            exec_globals["build"]()
        else:
            log.warning("No 'build' function found in the build script")
        os.chdir(wdir)


def copy_tree(src, dst) -> None:
    shutil.copytree(
        src,
        dst,
        ignore=lambda dir, contents: [
            f for f in contents if gitfiles.match(os.path.join(dir, f))
        ],
    )


def create_combined_addon(args: Namespace, packs: list):
    resource_pack = None
    behavior_pack = None
    
    for pack_dir, pack_metadata in packs:
        if pack_metadata.get("type") == "resource":
            resource_pack = (pack_dir, pack_metadata)
        elif pack_metadata.get("type") == "behavior":
            behavior_pack = (pack_dir, pack_metadata)
    
    if resource_pack and behavior_pack:
        addon_name = behavior_pack[1]["name"].replace("[BP]", "").strip()
        addon_filename = f"{addon_name} v{behavior_pack[1]['version']}.mcaddon"
        addon_path = os.path.join(args.output, "libs", addon_filename)
        
        log.info("Creating combined addon: %s", addon_filename)
        
        with zipfile.ZipFile(addon_path, mode="w") as addon_zip:
            rp_source = os.path.join(args.output, "tmp", resource_pack[0])
            for root, dirs, files in os.walk(rp_source):
                for file in files:
                    file_path = os.path.join(root, file)
                    archive_path = os.path.join("resource_pack", os.path.relpath(file_path, rp_source))
                    with open(file_path, "rb") as f:
                        addon_zip.writestr(archive_path.replace("\\", "/"), f.read())
            
            bp_source = os.path.join(args.output, "tmp", behavior_pack[0])
            for root, dirs, files in os.walk(bp_source):
                for file in files:
                    file_path = os.path.join(root, file)
                    archive_path = os.path.join("behavior_pack", os.path.relpath(file_path, bp_source))
                    with open(file_path, "rb") as f:
                        addon_zip.writestr(archive_path.replace("\\", "/"), f.read())
        
        log.info("Combined addon created: %s", addon_filename)
        
        for pack_dir, pack_metadata in packs:
            individual_addon = artifact_name(args, pack_dir, pack_metadata)
            if individual_addon.endswith('.mcpack'):
                individual_addon = individual_addon.replace('.mcpack', '.mcaddon')
                if os.path.exists(individual_addon):
                    os.remove(individual_addon)
                    log.info("Removed individual addon file: %s", os.path.basename(individual_addon))
    else:
        log.info("Skipping combined addon - need both resource and behavior packs")


def copy_builds_to_source():
    script_path = os.path.abspath(__file__)
    current_dir = os.path.dirname(script_path)
    
    project_root = current_dir
    while project_root != os.path.dirname(project_root):
        if os.path.exists(os.path.join(project_root, '.github')):
            break
        project_root = os.path.dirname(project_root)
    
    if os.path.basename(project_root) == '.github':
        project_root = os.path.dirname(project_root)
    
    log.info("Script path: %s", script_path)
    log.info("Project root determined as: %s", project_root)
    
    source_builds_dir = os.path.join(project_root, "builds")
    dist_libs_dir = os.path.join(project_root, "dist", "libs")
    
    if not os.path.exists(source_builds_dir):
        os.makedirs(source_builds_dir)
        log.info("Created builds directory: %s", source_builds_dir)
    
    if os.path.exists(dist_libs_dir):
        for file in os.listdir(dist_libs_dir):
            if file.endswith((".mcpack", ".mcaddon")):
                src_path = os.path.join(dist_libs_dir, file)
                dst_path = os.path.join(source_builds_dir, file)
                shutil.copy2(src_path, dst_path)
                log.info("Copied %s to builds/", file)
    else:
        log.warning("dist/libs directory not found at: %s", dist_libs_dir)


def main():
    outputs = {}
    excluded = ["*.py", "*.bat", "__pycache__/*", "contents.json"]
    for p in excluded:
        gitfiles.__ignore_filter__.patterns.add(p)

    parser = ArgumentParser()
    parser.add_argument("-s", "--buildScript", type=str, nargs="?")
    parser.add_argument("-i", "--input", type=str, default=".")
    parser.add_argument("-o", "--output", type=str, default="build")
    parser.add_argument(
        "-p", "--outputPattern", type=str, default="DIRNAME vVERSION.mcpack"
    )
    parser.add_argument("-d", "--debug", action="store_true")
    parser.add_argument("--pack-type", type=str, default="all", choices=["all", "behavior", "resource"])

    args, unknown = parser.parse_known_args()
    TMP = os.path.join(args.output, "tmp")
    log.info("Running with args: %s", args)

    if args.debug:
        log.setLevel(logging.DEBUG)

    pack_filter = os.getenv("PACK_TYPE", args.pack_type)
    log.info("Pack filter: %s", pack_filter)

    log.info("Creating artifact directory: %s", args.output)
    if os.path.exists(args.output):
        shutil.rmtree(args.output)
    os.makedirs(args.output, exist_ok=True)
    os.makedirs(os.path.join(args.output, "libs"), exist_ok=True)

    copy_tree(args.input, TMP)

    if args.buildScript != "none" and args.buildScript:
        start = time.time()
        sys.argv = unknown
        sys.argv.insert(0, args.buildScript)
        build_script(args.buildScript, args.output)
        log.info("\033[92mFinished in %s ms\033[0m", round(time.time() - start, 2))

    packs = list(find_packs(TMP, pack_filter))
    for pack in packs:
        log.info("Bundling pack: %s", pack[0])
        compile_pack(args, *pack)
    if len(packs) == 0:
        log.warning("\033[91mNo packs found: %s!\033[0m", TMP)

    outputs["packs"] = [pack[1] for pack in packs]

    if pack_filter == "all":
        create_combined_addon(args, packs)

    copy_builds_to_source()

    if os.getenv("GITHUB_OUTPUT"):
        log.debug("Writing pack metadata to GitHub outputs")
        with open(os.getenv("GITHUB_OUTPUT"), "a") as fh:
            for k, v in outputs.items():
                fh.write(f"{ k }={ json.dumps(v) }\n")


if __name__ == "__main__":
    log.info("Starting build process")
    main()
    log.info("\033[92mBuild process finished\033[0m")