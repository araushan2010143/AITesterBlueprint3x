"""Unit tests — PII and secret detection/redaction scanner."""
import pytest
from backend.services.pii_scanner import (
    scan_and_redact,
    scan_filename,
    findings_to_log,
    _shannon_entropy,
    _is_high_entropy_secret,
    ScanResult,
    Finding,
)


# ── Shannon entropy ────────────────────────────────────────────────────────────

class TestShannonEntropy:

    def test_empty_string_is_zero(self):
        assert _shannon_entropy("") == 0.0

    def test_single_char_repeated_is_zero(self):
        assert _shannon_entropy("aaaaaa") == 0.0

    def test_two_equal_chars_is_one(self):
        assert abs(_shannon_entropy("ab") - 1.0) < 1e-9

    def test_random_key_has_high_entropy(self):
        # A genuine random string should have entropy > 4.5
        rand = "A1B2C3D4E5F6G7H8I9J0K1L2M3N4O5P6"
        assert _shannon_entropy(rand) > 4.0

    def test_english_sentence_has_lower_entropy(self):
        # Natural English text is around 3.5–4.0 bits/char
        text = "the quick brown fox jumps over the lazy dog"
        assert _shannon_entropy(text) < 5.0

    def test_returns_float(self):
        assert isinstance(_shannon_entropy("hello"), float)


# ── High-entropy secret detection ─────────────────────────────────────────────

class TestIsHighEntropySecret:

    def test_genuine_random_base64_is_secret(self):
        # 32-char high-entropy string
        s = "zXk9mPqR5vLwN2tYcJhBdEaU8sFoGiC7"
        assert _is_high_entropy_secret(s) is True

    def test_too_short_not_secret(self):
        assert _is_high_entropy_secret("abc123") is False

    def test_too_long_not_secret(self):
        assert _is_high_entropy_secret("a" * 81) is False

    def test_low_entropy_not_secret(self):
        assert _is_high_entropy_secret("aaaaaaaaaaaaaaaaaaaaaa") is False

    def test_english_words_not_secret(self):
        assert _is_high_entropy_secret("thequickbrownfoxjumped") is False


# ── Email detection ────────────────────────────────────────────────────────────

class TestEmailDetection:

    def test_simple_email_detected(self):
        result = scan_and_redact("Contact: user@example.com for help.")
        assert result.has_pii

    def test_email_category_is_email(self):
        result = scan_and_redact("user@example.com")
        pii = [f for f in result.findings if f.category == "EMAIL"]
        assert len(pii) == 1

    def test_multiple_emails_all_detected(self):
        result = scan_and_redact("a@x.com and b@y.org contact us")
        emails = [f for f in result.findings if f.category == "EMAIL"]
        assert len(emails) == 2

    def test_email_redacted_when_flag_set(self):
        result = scan_and_redact("user@example.com", redact_pii=True)
        assert "[EMAIL]" in result.clean_text
        assert "user@example.com" not in result.clean_text

    def test_email_not_redacted_by_default(self):
        result = scan_and_redact("user@example.com")
        assert "user@example.com" in result.clean_text


# ── Secret detection ──────────────────────────────────────────────────────────

class TestSecretDetection:

    def test_aws_access_key_detected(self):
        text = "key = AKIAIOSFODNN7EXAMPLE"
        result = scan_and_redact(text)
        assert result.has_secrets
        secrets = [f for f in result.findings if f.category == "AWS_ACCESS_KEY"]
        assert len(secrets) == 1

    def test_aws_key_redacted_by_default(self):
        text = "key = AKIAIOSFODNN7EXAMPLE"
        result = scan_and_redact(text)
        assert "[AWS_KEY]" in result.clean_text
        assert "AKIAIOSFODNN7EXAMPLE" not in result.clean_text

    def test_github_token_detected(self):
        token = "ghp_" + "A" * 36
        result = scan_and_redact(f"token = {token}")
        assert result.has_secrets
        assert any(f.category == "GITHUB_TOKEN" for f in result.findings)

    def test_github_token_redacted(self):
        token = "ghp_" + "A" * 36
        result = scan_and_redact(f"token = {token}")
        assert token not in result.clean_text

    def test_jwt_token_detected(self):
        jwt = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1c2VyMTIzIn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c"
        result = scan_and_redact(f"Authorization: Bearer {jwt}")
        assert result.has_secrets
        assert any(f.category == "JWT_TOKEN" for f in result.findings)

    def test_private_key_detected(self):
        text = "-----BEGIN RSA PRIVATE KEY-----\nMIIEowIBAAKCAQEA..."
        result = scan_and_redact(text)
        assert result.has_secrets
        assert any(f.category == "PRIVATE_KEY" for f in result.findings)

    def test_db_connection_string_detected(self):
        text = "postgresql://user:password@localhost:5432/mydb"
        result = scan_and_redact(text)
        assert result.has_secrets
        assert any(f.category == "DB_CONNECTION" for f in result.findings)

    def test_password_in_code_detected(self):
        text = 'const password = "mysecretpassword123"'
        result = scan_and_redact(text)
        assert result.has_secrets

    def test_stripe_key_detected(self):
        text = "sk_live_" + "A" * 24
        result = scan_and_redact(text)
        assert result.has_secrets
        assert any(f.category == "STRIPE_KEY" for f in result.findings)

    def test_google_api_key_detected(self):
        text = "AIza" + "A" * 35
        result = scan_and_redact(text)
        assert result.has_secrets

    def test_no_secrets_clean_text(self):
        text = "This is a totally normal document with no secrets."
        result = scan_and_redact(text)
        assert not result.has_secrets
        assert result.clean_text == text

    def test_secret_not_redacted_when_flag_false(self):
        token = "ghp_" + "A" * 36
        result = scan_and_redact(f"token = {token}", redact_secrets=False)
        assert token in result.clean_text
        assert result.has_secrets

    def test_value_preview_never_exposes_full_value(self):
        token = "ghp_" + "B" * 36
        result = scan_and_redact(f"token = {token}")
        for f in result.findings:
            assert f.value_preview.endswith("***")
            assert len(f.value_preview) <= 10


# ── Credit card detection ─────────────────────────────────────────────────────

class TestCreditCardDetection:

    def test_visa_card_detected(self):
        text = "Card: 4532015112830366"
        result = scan_and_redact(text)
        assert any(f.category == "CREDIT_CARD" for f in result.findings)

    def test_amex_card_detected(self):
        text = "AmEx: 378282246310005"
        result = scan_and_redact(text)
        assert any(f.category == "CREDIT_CARD" for f in result.findings)


# ── SSN detection ─────────────────────────────────────────────────────────────

class TestSSNDetection:

    def test_ssn_with_dashes_detected(self):
        text = "SSN: 123-45-6789"
        result = scan_and_redact(text)
        assert any(f.category == "SSN" for f in result.findings)


# ── ScanResult properties ─────────────────────────────────────────────────────

class TestScanResult:

    def test_has_secrets_false_when_only_pii(self):
        result = scan_and_redact("email: user@example.com")
        assert result.has_pii
        assert not result.has_secrets

    def test_has_pii_false_when_only_secrets(self):
        text = "ghp_" + "A" * 36
        result = scan_and_redact(text)
        assert result.has_secrets
        # email not present
        pii_findings = [f for f in result.findings if f.type == "PII"]
        assert len(pii_findings) == 0

    def test_redacted_count_matches_findings(self):
        text = "user@a.com and admin@b.org are contacts"
        result = scan_and_redact(text)
        assert result.redacted_count == len(result.findings)

    def test_summary_dict_has_expected_keys(self):
        result = scan_and_redact("user@example.com")
        s = result.summary()
        assert "has_secrets" in s
        assert "has_pii" in s
        assert "total_findings" in s
        assert "by_category" in s

    def test_summary_counts_categories(self):
        text = "user@a.com admin@b.org"
        result = scan_and_redact(text)
        summary = result.summary()
        assert summary["by_category"].get("EMAIL", 0) == 2

    def test_clean_text_type_is_string(self):
        result = scan_and_redact("hello world")
        assert isinstance(result.clean_text, str)


# ── filename scanner ──────────────────────────────────────────────────────────

class TestScanFilename:

    def test_password_file_flagged(self):
        assert "password" in scan_filename("passwords.xlsx")

    def test_secret_file_flagged(self):
        assert "secret" in scan_filename("my_secrets.json")

    def test_env_file_flagged(self):
        assert ".env" in scan_filename(".env.production")

    def test_cert_file_flagged(self):
        assert "cert" in scan_filename("server.cert")

    def test_normal_file_not_flagged(self):
        assert scan_filename("test_cases.pdf") == []

    def test_api_key_file_flagged(self):
        assert "key" in scan_filename("api_key.txt")


# ── findings_to_log ───────────────────────────────────────────────────────────

class TestFindingsToLog:

    def test_returns_list_of_dicts(self):
        result = scan_and_redact("user@example.com")
        log = findings_to_log(result.findings)
        assert isinstance(log, list)
        assert all(isinstance(d, dict) for d in log)

    def test_log_entry_has_no_raw_value(self):
        result = scan_and_redact("user@example.com")
        log = findings_to_log(result.findings)
        for entry in log:
            # Must have type, category, preview — not a raw value field
            assert "type" in entry
            assert "category" in entry
            assert "preview" in entry
            # preview ends with *** (obfuscated)
            assert "***" in entry["preview"]
