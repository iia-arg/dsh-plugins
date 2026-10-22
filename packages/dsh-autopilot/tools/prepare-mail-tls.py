#!/usr/bin/python3
"""Prepare a private TLS pair in a new directory; never install or restart."""
import argparse
import hashlib
from pathlib import Path
import ssl
import subprocess
import sys


def main():
    parser=argparse.ArgumentParser(description=__doc__,allow_abbrev=False)
    parser.add_argument('--directory',type=Path,required=True)
    path=parser.parse_args().directory
    if not path.is_absolute() or '..' in path.parts or path.parent.resolve()!=path.parent:
        raise ValueError('NONCANONICAL_OUTPUT')
    path.mkdir(mode=0o700)  # Existing file, directory or symlink => refusal.
    key=path/'server.key';cert=path/'server.pem'
    try:
        subprocess.run(['/usr/bin/openssl','req','-x509','-newkey','ec','-pkeyopt',
            'ec_paramgen_curve:P-256','-nodes','-days','365',
            '-subj','/CN=autopilot-mail.internal',
            '-addext','subjectAltName=DNS:autopilot-mail.internal',
            '-addext','basicConstraints=critical,CA:FALSE',
            '-addext','extendedKeyUsage=serverAuth','-keyout',str(key),'-out',str(cert)],
            check=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,timeout=15)
        key.chmod(0o600);cert.chmod(0o644)
        ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER).load_cert_chain(cert,key)
        pin=hashlib.sha256(ssl.PEM_cert_to_DER_cert(cert.read_text())).hexdigest()
        print('PREPARED_ONLY certificate_sha256='+pin+'; private_key='+str(key))
        return 0
    except BaseException:
        print('TLS_PREPARATION_FAILED: private output retained at '+str(path),file=sys.stderr)
        raise


if __name__=='__main__':
    try:sys.exit(main())
    except (OSError,ValueError,subprocess.SubprocessError):
        print('TLS_PREPARATION_REFUSED',file=sys.stderr);sys.exit(2)
