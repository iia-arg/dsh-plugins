#!/usr/bin/env python3
"""Read-only source preparation for AP telemetry; no model/job control."""
import importlib.util
from pathlib import Path
import sys
sys.dont_write_bytecode=True
base=Path(__file__).resolve().parent.parent
source=base/'runtime/runtime_receipt_source.py'
if not source.is_file():source=Path(__file__).resolve().with_name('runtime_receipt_source.py')
spec=importlib.util.spec_from_file_location('runtime_receipt_source',source)
module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
if __name__=='__main__':sys.exit(module.owner_main())
