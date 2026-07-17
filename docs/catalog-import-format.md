# Catalog Song Import JSON Format

Phase 29 does not implement a full importer or import UI. It defines a small dependency-free interchange shape for a future catalog import milestone.

The import payload is an array of song records:

```json
[
  {
    "language": "czech",
    "number": "101",
    "title": "Example song",
    "active": true,
    "sheetMusicUrl": "https://example.com/song.pdf"
  }
]
```

Valid fields:

- `language` — required, exactly `czech` or `polish`.
- `number` — required non-empty string. It is unique only together with `language`.
- `title` — required non-empty string.
- `active` — optional boolean. If omitted, importer code may choose its own default in a future milestone; non-boolean values are invalid.
- `sheetMusicUrl` — optional HTTP(S) URL string. Empty or missing means no sheet-music link.

Validation rejects unsupported language values, empty number/title values, non-string or non-HTTP(S) sheet-music URLs, non-boolean `active`, and duplicate `(language, number)` pairs within one input. The same `number` is valid in different languages.

## Development seed reservation

The explicit Phase 29 development seed uses reserved non-production song numbers such as `PH29-DEMO-101`, `PH29-DEMO-202`, and `PH29-DEMO-999`. These values are intentionally not real chorale numbers, so ordinary Czech or Polish catalog records such as number `101` can coexist with the demo seed without being overwritten.
