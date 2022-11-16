const fs = require("fs");
const process = require("process");
const path = require("path")

const express = require("express");
const ws = require("express-ws");
const pty = require("node-pty");
const e = require("express");

const app = express();

const expressWs = ws(app);

class Terminal{
	constructor() {}
  static shell;
  static code;
  static debugInfo = {
    lines: [], lastAction: null,
  }

 static isDebug() {
    return !!Terminal.debugInfo
  }

  static async init(code, debugInfo=null) {
    await Terminal.kill()

    Terminal.code = code
    fs.writeFileSync('./myfile.py', Terminal.code)

    Terminal.debugInfo = debugInfo
    if (Terminal.isDebug()) {
      const debugCommand = Terminal.getDebugCommand()
      Terminal.shell = pty.spawn("python3", ["-m", "pdb", ...debugCommand, "myfile.py"], { name: "xterm-color" });
    }
    else {
      Terminal.shell = pty.spawn(`python3`, ["-m", "myfile"], { name: "xterm-color" });
    }
  }

  static getDebugCommand() {
      let {lines} = Terminal.debugInfo
      let command = []
      command = lines.reduce((command, line) => command.concat(['-c', `b ${line}`]), [])
      command = command.concat(["-c", "c"])
      return command
    }

  static async kill() {
    if (Terminal.shell) {
      Terminal.shell.kill()
    }
    Terminal.shell = null;
    Terminal.code = ""
    Terminal.debugInfo = null;
    if (fs.existsSync('/myfile.py')) {
      fs.unlinkSync("./myfile.py")
    }
  }

  static addBreakpoint(line) {
    
  }

  static removeBreakpoint(line) {

  }

  static stepOver() {
    Terminal.shell.write("n\n")
    Terminal.debugInfo.lastAction = "step-over"
  }

  static stepInto() {
    Terminal.shell.write("s\n")
    Terminal.debugInfo.lastAction = "step-into"
  }

  static stepOut() {
    Terminal.shell.write("r\n")
    Terminal.debugInfo.lastAction = "step-out"
  }

  static continue() {
    Terminal.shell.write("c\n")
    Terminal.debugInfo.lastAction = "continue"
  }

}

const sendSocketMessage = (ws, data) => {
  if (ws.readyState === 1) {
    ws.send(data)
  }
}

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname + '/index.html'));
});

app.ws("/ws", (ws) => {
  // setTimeout(() => {term.kill(), 3600 * 1000); // session timeout
  ws.on("message", async (event) => {
    event = JSON.parse(event)
    const {action, payload } = event
    if (action === "stop") {
      sendSocketMessage(ws, JSON.stringify({action: "close"}))
      Terminal.kill()
    }
    else if (action === "run") {
      let {code} = payload
      await Terminal.init(code)
      Terminal.shell.on("data", (data) => {
        try {
          sendSocketMessage(ws, JSON.stringify({action: "run-result", payload: {data}}))
        }
        catch (err) {console.error(err)}
      })    
      Terminal.shell.on("exit", (data) => {
        sendSocketMessage(ws, JSON.stringify({action: "close"}))
        Terminal.kill()
      })      
    }
    else if (action === "debug") {
      let {code, debugInfo} = payload
      await Terminal.init(code, debugInfo)
      Terminal.shell.on("data", (data) => {
        try {
          console.log(data)
          sendSocketMessage(ws, JSON.stringify({action: "debug-result", payload: {data}})) 
        }
        catch (err) {console.error(err)}
      })    
      Terminal.shell.on("exit", (data) => {
        sendSocketMessage(ws, JSON.stringify({action: "close"}))
        Terminal.kill()
      })      
    }
    else if (action === "step-over") {
      Terminal.stepOver()
    }
    else if (action === "step-into") {
      Terminal.stepInto()
    } 
    else if (action === "step-out") {
      Terminal.stepOut()
    }
    else if (action === "continue") {
      Terminal.continue()
    }
  });
  ws.on("close", () => {
    Terminal.kill()
  })
});

// Prevent malformed packets from crashing server.
expressWs.getWss().on("connection", (ws) => ws.on("error", console.error));

app.listen(parseInt(3000), "0.0.0.0");
