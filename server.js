const fs = require("fs");
const process = require("process");
const path = require("path")

const express = require("express");
const ws = require("express-ws");
const { spawn } = require('node:child_process');
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
      Terminal.shell = spawn("python3", ["-m", "pdb", ...debugCommand, "myfile.py"], { name: "xterm-color" });
    }
    else {
      Terminal.shell = spawn(`python3`, ["-m", "myfile"]);
    }
    Terminal.shell.stdin.setEncoding('utf-8');
  }

  static getDebugCommand() {
      let {lines} = Terminal.debugInfo
      let command = []
      command = lines.reduce((command, line) => command.concat(['-c', `b ${line}`]), [])
      command = command.concat(["-c", "c"])
      console.log(command.join(" "))
      return command
    }

  static async kill() {
    if (Terminal.shell) {
      Terminal.shell.kill('SIGINT')
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
    Terminal.shell.stdin.write("n\n");
    Terminal.debugInfo.lastAction = "step-over"
  }

  static stepInto() {
    Terminal.shell.stdin.write("s\n");
    Terminal.debugInfo.lastAction = "step-into"
  }

  static stepOut() {
    Terminal.shell.stdin.write("r\n");
    Terminal.debugInfo.lastAction = "step-out"
  }

  static continue() {
    Terminal.shell.stdin.write("c\n");
    Terminal.debugInfo.lastAction = "continue"
  }

}

const sendSocketMessage = (ws, data) => {
  if (ws.readyState === 1) {
    ws.send(data)
  }
}

const getStrFromBytes = (bytes) => {
  return new Buffer.from(bytes).toString()
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
      Terminal.shell.stdout.on("data", (data) => {
        try {
          sendSocketMessage(ws, JSON.stringify({action: "run-result", payload: {data: getStrFromBytes(data)}}))
        }
        catch (err) {console.error(err)}
      })
      Terminal.shell.stderr.on("data", (data) => {
        try {
          sendSocketMessage(ws, JSON.stringify({action: "run-result", payload: {data: getStrFromBytes(data)}}))
        }
        catch (err) {console.error(err)}
      })    
      Terminal.shell.on("close", () => {
        sendSocketMessage(ws, JSON.stringify({action: "close"}))
        Terminal.kill()
      })      
    }
    else if (action === "debug") {
      let {code, debugInfo} = payload
      await Terminal.init(code, debugInfo)
      Terminal.shell.stdout.on("data", (data) => {
        data = getStrFromBytes(data)
        try {
          sendSocketMessage(ws, JSON.stringify({action: "debug-result", payload: {data}})) 
        }
        catch (err) {console.error(err)}
      })    
      Terminal.shell.stderr.on("data", (data) => {
        data = getStrFromBytes(data)
        try {
          sendSocketMessage(ws, JSON.stringify({action: "debug-result", payload: {data}})) 
        }
        catch (err) {console.error(err)}
      })    
      Terminal.shell.on("close", (data) => {
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

app.listen(parseInt(4200), "0.0.0.0");
