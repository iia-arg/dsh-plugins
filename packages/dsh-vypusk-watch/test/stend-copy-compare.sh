#!/bin/bash
set -eu
cd "$(dirname "$0")"
exec python3 -B -m unittest -v test_copy_compare test_copy_wiring
