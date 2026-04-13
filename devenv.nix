{ pkgs, ... }:
{
  packages = [
    pkgs.git
    pkgs.nodejs_22
    pkgs.python311
  ];

  env = {
    npm_config_cache = ".local/dev/npm-cache";
    MISE_DATA_DIR = ".mise/data";
    MISE_CACHE_DIR = ".mise/cache";
    MISE_CONFIG_DIR = ".mise/config";
    MISE_STATE_DIR = ".mise/state";
  };

  enterShell = ''
    export PATH="$PWD/.local/dev/bin:$PWD/node_modules/.bin:$PATH"
    echo "pi-autoclanker devenv shell active."
  '';
}
