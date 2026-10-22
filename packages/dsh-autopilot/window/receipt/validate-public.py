#!/usr/bin/python3
"""Use the accepted producer's public shape/arithmetic validator before window checks."""
import importlib.util,json,sys
from pathlib import Path
failures=(OSError,ValueError,KeyError,TypeError,AttributeError)
try:
 if len(sys.argv)!=5:raise ValueError()
 release,receipt,run,project=sys.argv[1:];p=Path(release)/'skill/tools/team_usage.py'
 spec=importlib.util.spec_from_file_location('p_public_validator',p);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
 failures=failures+(m.Incomplete,)
 raw=Path(receipt).read_bytes()
 if len(raw)>2097152:raise ValueError()
 m.public_receipt(m.strict_json(raw),run,project=project)
 print('PUBLIC RECEIPT: принятый валидатор формы/частичной арифметики нового L пропустил исходник')
except failures:print('СТОП: identity/shape/arithmetic всей квитанции не прошли public_receipt нового L');sys.exit(2)
