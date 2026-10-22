#!/usr/bin/env python3
"""Stage a root-owned registration file; the collector is the sole index writer."""
import importlib.util
from pathlib import Path
import sys
sys.dont_write_bytecode=True
base=Path(__file__).resolve().parent.parent
source=base/'runtime/time_collection.py'
if not source.is_file():source=Path(__file__).resolve().with_name('time_collection.py')
spec=importlib.util.spec_from_file_location('time_collection',source)
module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
if __name__=='__main__':sys.exit(module.registration_main())
