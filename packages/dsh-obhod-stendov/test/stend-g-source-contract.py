#!/usr/bin/env python3
"""Nightly live contract; stend-* name is required by the collector selector."""
from pathlib import Path
import runpy
if __name__=='__main__':runpy.run_path(str(Path(__file__).with_name('g-source-contract.py')),run_name='__main__')
