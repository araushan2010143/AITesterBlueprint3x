# HashiCorp Vault — Production server config
# Run: vault server -config=vault.hcl
# Then: export VAULT_ADDR=http://127.0.0.1:8200
#       vault operator init          (first time only — save unseal keys)
#       vault operator unseal        (3 times with 3 different keys)
#       vault login <root-token>

ui            = true
disable_mlock = true   # set false on Linux prod; true needed on macOS

storage "file" {
  path = "./vault-data"   # persists across restarts; back this up
}

listener "tcp" {
  address     = "127.0.0.1:8200"
  tls_disable = 1          # enable TLS in production with tls_cert_file/tls_key_file
}

api_addr     = "http://127.0.0.1:8200"
cluster_addr = "http://127.0.0.1:8201"

# Enable audit logging (recommended for production)
# vault audit enable file file_path=./vault-audit.log
