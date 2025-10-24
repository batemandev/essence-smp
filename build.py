from argparse import ArgumentParser
import os


def build():
    parser = ArgumentParser()
    parser.add_argument("--example", action="store_true")

    args = parser.parse_args()

    log.info("Starting pack build with args: %s", args)

    log.info("Current working directory: %s", os.getcwd())
    log.info("Files in current directory: %s", os.listdir('.'))
    
    os.makedirs('behavior_pack', exist_ok=True)