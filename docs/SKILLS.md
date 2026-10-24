# Strix — AI pentest untuk Rapkumer

## Instalasi

```sh
curl -sSL https://strix.ai/install | bash
```

Butuh **Docker** (running) dan satu **LLM API key** dari provider yang didukung.

## Konfigurasi LLM

Set environment variable sebelum menjalankan strix:

```sh
export STRIX_LLM="openai/<model-name>"
export LLM_API_KEY="your-api-key"
export LLM_API_BASE="your-api-base-url"   # hanya untuk model lokal (Ollama, dll)
```

Rekomendasi model untuk hasil terbaik (menurut docs Strix):

- `zai/glm-5.3` — default, bagus untuk security reasoning
- `anthropic/claude-sonnet-4-6`
- `openai/gpt-5.4`

Konfigurasi tersimpan otomatis di `~/.strix/cli-config.json`.

## Perintah dasar

```sh
# Scan cepat (recommended untuk pengembangan)
strix -n -t ./ --scan-mode quick --max-budget 15

# Scan standar (lebih menyeluruh, butuh budget lebih tinggi)
strix -n -t ./ --scan-mode standard --max-budget 30

# Lihat hasil terakhir di browser
strix view
```

`-n` = non-interactive (cocok untuk headless/CI).

## Re-scanning setelah fix

Untuk memverifikasi bahwa suatu vuln sudah tertutup, gunakan `--scope-mode diff`:

```sh
# Diff terhadap branch dasar (hanya file yang berubah di-review)
strix -n -t ./ --scan-mode quick \
  --scope-mode diff \
  --diff-base origin/main \
  --max-budget 5
```

Atau berikan instruksi spesifik ke agent:

```sh
strix -n -t ./ \
  --instruction "Verify the IDOR in /api/keasramaan/export is fixed. Original PoC: set active-kelas-id cookie to other class." \
  --max-budget 5
```

## Hasil

Semua hasil tersimpan di `strix_runs/<run-name>/` (gitignored):

- `vulnerabilities/*.md` — satu file per finding, ada PoC + remediation
- `vulnerabilities.json` — format JSON
- `findings.sarif` — format SARIF, bisa di-upload ke GitHub Code Scanning
- `run.json` — metadata: status, biaya, model

## Skills di project ini

Skills sudah terinstall di `.agents/skills/` (opencode akan mem-pickup otomatis):

**Strix (security):** api-security-testing, application-security-testing, ci-security-scanning, find/fix vulnerabilities, owasp-top-10, penetration-testing, managed-pentesting, web-app-penetration-testing.

**Bahasa Indonesia:** bahasa-inti (aturan inti penulisan), bahasa-website (UX writing).

## Langkah pertama kali

1. Install strix CLI: `curl -sSL https://strix.ai/install | bash`
2. Mulai Docker (atau pastikan Docker daemon running)
3. Set env vars LLM (lihat Konfigurasi di atas)
4. Jalankan scan: `strix -n -t ./ --scan-mode quick --max-budget 15`
5. Lihat hasil: `strix view` atau buka `strix_runs/<run>/vulnerabilities/`
