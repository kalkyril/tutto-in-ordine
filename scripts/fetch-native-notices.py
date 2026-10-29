#!/usr/bin/env python3
"""Ripristina esclusivamente i file già revisionati del catalogo nativo; non approva nuove versioni."""
import argparse, base64, hashlib, io, json, pathlib, tarfile, urllib.request
ROOT = pathlib.Path(__file__).resolve().parent.parent / 'licenses' / 'native'
def digest(data):
    return hashlib.sha256(data).hexdigest()
def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--restore', action='store_true', help='scarica i file mancanti dalle fonti registrate, verificandone gli hash')
    args = parser.parse_args()
    if not args.restore:
        parser.error('Usa --restore per recuperare avvisi e sorgenti già registrati nel manifest')
    catalog = json.loads((ROOT / 'manifest.json').read_text())
    downloads = {}
    for entry in catalog['files']:
        rel = pathlib.PurePosixPath(entry['file'])
        if rel.is_absolute() or any(p in ('..', '.') for p in rel.parts) or '\\' in entry['file']:
            raise ValueError('Percorso non valido')
        target = ROOT / rel
        if target.exists() and digest(target.read_bytes()) == entry['sha256']:
            continue
        source = entry['source']; url = source['url']
        if not url.startswith('https://'):
            raise ValueError('Fonte HTTPS richiesta')
        if url not in downloads:
            request = urllib.request.Request(url, headers={'User-Agent': 'TIO-native-notices'})
            with urllib.request.urlopen(request, timeout=60) as response:
                downloads[url] = response.read(128 * 1024 * 1024 + 1)
            if len(downloads[url]) > 128 * 1024 * 1024:
                raise ValueError('Fonte troppo grande')
        data = downloads[url]
        if 'archiveSha256' in source or 'archiveIntegrity' in source:
            valid = digest(data) == source['archiveSha256'] if 'archiveSha256' in source else 'sha512-' + base64.b64encode(hashlib.sha512(data).digest()).decode() == source['archiveIntegrity']
            if not valid:
                raise ValueError('Archivio upstream modificato: ' + url)
            with tarfile.open(fileobj=io.BytesIO(data)) as archive:
                data = archive.extractfile(source['member']).read()
            if 'nestedMember' in source:
                with tarfile.open(fileobj=io.BytesIO(data)) as archive:
                    data = archive.extractfile(source['nestedMember']).read()
        elif source.get('encoding') == 'base64':
            data = base64.b64decode(data)
        if source.get('format') == 'json-pretty':
            data = json.dumps(json.loads(data), indent=2).encode()
        if digest(data) != entry['sha256']:
            raise ValueError('Hash non corrispondente: ' + entry['file'])
        target.parent.mkdir(parents=True, exist_ok=True)
        if not target.resolve().is_relative_to(ROOT.resolve()):
            raise ValueError('Percorso fuori dalla raccolta')
        target.write_bytes(data)
        print('Recuperato:', entry['file'])
    print('Raccolta verificata; nessuna nuova versione approvata automaticamente.')
if __name__ == '__main__':
    main()
