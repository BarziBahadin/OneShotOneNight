# Localization and RTL

The first release ships in English. The frontend keeps locale-sensitive decisions centralized:

- `html lang` and `dir` live in `app/layout.tsx`.
- User-facing strings should move into locale dictionaries before Arabic or Kurdish are added.
- Layouts use logical spacing where practical and avoid assumptions that controls appear only on the right.
- Future locales should include `en`, `ar`, `ku`, with Arabic and Kurdish rendered with `dir="rtl"` when appropriate.
