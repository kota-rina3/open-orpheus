import "./app";
import "./os";
import "./network";
import "./update";
import "./im";
import "./nimsys";

if (process.argv.includes("--preload-channel=main")) {
  // Only main window uses player
  import("./audioplayer");
  import("./audioeffect");
  import("./player");
}
