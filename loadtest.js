const { Writable } = require('stream')
const { Sparkline } = require('clui')
const request = require('request')
const fs = require('fs')

class Metrics {
  constructor() {
    this.clients = []
    this.frames = []
    this.events = []
    this.errors = []
  }

  addClient(client) {
    this.clients.push(client)
  }

  addEvent(event) {
    this.events.push(event)
  }

  addError(error) {
    this.errors.push(error)
  }

  removeClient(client) {
    this.clients = this.clients.filter(c => c === client)
  }

  start() {
    let frame = 0
    this.timer = setInterval(() => this.measure(++frame), 1000)
  }

  stop() {
    clearInterval(this.timer)
  }

  onFrame(handler) {
    this.handler = handler
  }

  measure(frameNumber) {
    const frame = {
      frame: frameNumber,
      clientCount: this.clients.length,
      eventCount: this.events.length,
      errorCount: this.errors.length,
    }

    this.frames.push(frame)
    this.events = []
    this.errors = []

    if (this.frames.length > 30) {
      this.frames.shift()
    }

    if (this.handler != null) {
      this.handler(this.frames)
    }
  }
}

class Stream extends Writable {
  constructor(metrics) {
    super()
    this.event = ''
    this.metrics = metrics
  }

  write(chunk, encoding, callback) {
    this.event += chunk.toString()
    if (this.event.slice(-2) == '\n\n') {
      this.handleEvent(this.event)
      this.event = ''
    }
  }

  end(buffer, cb) {
    console.log('ended!')
  }

  handleEvent(event) {
    this.metrics.addEvent(event)
  }
}

let nextId = 0

function spawn(metrics) {
  nextId++

  const client = request('http://localhost:8888/events')
    .on('error', error => metrics.addError(error))
    .pipe(new Stream(metrics))
  metrics.addClient(client)
}

function spawnGroup(count, metrics) {
  for (var i = 0; i < count; i++) {
    spawn(metrics)
  }
}

function main() {
  const statsFile = 'stats.csv'
  createCsv(statsFile)

  const metrics = new Metrics()
  metrics.start()
  metrics.onFrame(frames => {
    displayMetrics(frames)
    writeToCsv(statsFile, frames)
  })

  setInterval(() => spawnGroup(100, metrics), 1000)
}

function displayMetrics(frames) {
  const clients = padArray(frames.map(frame => frame.clientCount), 30)
  const events = padArray(frames.map(frame => frame.eventCount), 30)
  const errors = padArray(frames.map(frame => frame.errorCount), 30)

  console.log(Sparkline(clients, 'clients'))
  console.log(Sparkline(events, 'events/sec'))
  console.log(Sparkline(errors, 'errors/sec'))
}

function createCsv(file) {
  fs.writeFile(file, 'Frame,Clients,Events/Sec,Errors/Sec\n', error => {
    if (error) {
      console.error('Error creating CSV')
    }
  })
}

function writeToCsv(file, frames) {
  const frame = frames[frames.length - 1]
  fs.appendFile(
    'stats.csv',
    `${frame.frame},${frame.clientCount},${frame.eventCount},${
      frame.errorCount
    }\n`,
    error => {
      if (error) {
        console.error('Error writing frame to CSV')
      }
    }
  )
}

function padArray(items, count) {
  var fill = Array.from({ length: count - items.length }).map(() => 0)
  return fill.concat(items)
}

main()

// https
//   .get('http://localhost:8888/events', resp => {
//     let data = ''

//     // A chunk of data has been recieved.
//     resp.on('data', chunk => {
//       data += chunk
//       console.log(chunk)
//     })

//     // The whole response has been received. Print out the result.
//     resp.on('end', () => {
//       console.log(JSON.parse(data).explanation)
//     })
//   })
//   .on('error', err => {
//     console.log('Error: ' + err.message)
//   })
