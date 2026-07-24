# Phase 31A accepted catalog handoff

This directory contains the authoritative catalog artifacts prepared for GitHub issue #91.

## Materialize the two canonical catalog JSON files

Run from the repository root:

```bash
node data/catalog/materialize-catalogs.mjs
```

The script:

1. joins the numbered UTF-8 transport parts in `payload/`;
2. decodes Base64 and decompresses gzip;
3. writes:
   - `data/catalog/catalog-czech-final.json`
   - `data/catalog/catalog-polish-final.json`
4. verifies all four authoritative SHA-256 hashes;
5. checks the expected catalog record counts.

The payload split is only a lossless transport wrapper used to place the larger JSON files into the prepared GitHub branch. It is not the application import format. The implementation PR must use and commit the reconstructed canonical JSON files. It may remove the transport parts after their hashes have been proven.

## Frozen artifact contract

| Artifact | Expected records / purpose | SHA-256 |
|---|---:|---|
| `catalog-czech-final.json` | 808 Czech records | `5aaf767a5cc7f21d2c428be6ef3d07f58ebf6f5e1303807177254283cd1896f9` |
| `catalog-polish-final.json` | 990 Polish records | `b06a3c452709213f4f60dcb0243e6a91bf00fd1881eac10b941b6bd05601cea9` |
| `catalog-czech-validation.json` | accepted Czech validation | `e47da19e263f1ba962cb8e2699c6e94125499438a3ff74ccf78bdb29517cab40` |
| `catalog-polish-validation.json` | accepted Polish validation | `49a0accd4392ff9167707e2677d9edab9b5ed9ceb7d0d023a2251dfbca1b5559` |

Do not scrape, reconstruct from web pages, normalize titles, reformat the accepted files, or silently change records. Follow issue #91 for database reset, import, runtime, isolation, acceptance, and rollback requirements.
