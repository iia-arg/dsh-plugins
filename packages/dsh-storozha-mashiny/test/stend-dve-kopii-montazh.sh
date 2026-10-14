#!/bin/bash
set -eu
cd "$(dirname "$0")"
exec python3 -B -m unittest -v test_dve_kopii_montazh
