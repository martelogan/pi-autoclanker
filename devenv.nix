{ pkgs, ... }:
{
  packages = [
    pkgs.git
    pkgs.nodejs_22
    pkgs.nodePackages.pnpm
    pkgs.python311
  ];

  env = {
    PNPM_HOME = ".local/dev/pnpm-home";
    npm_config_cache = ".local/dev/npm-cache";
    MISE_DATA_DIR = ".mise/data";
    MISE_CACHE_DIR = ".mise/cache";
    MISE_CONFIG_DIR = ".mise/config";
    MISE_STATE_DIR = ".mise/state";
  };

  enterShell = ''
    export PATH="$PWD/.local/dev/bin:$PWD/.local/dev/pnpm-home:$PWD/node_modules/.bin:$PATH"
    echo "pi-autoclanker devenv shell active."
  '';
}
