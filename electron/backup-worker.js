'use strict'
const { workerData, parentPort } = require('node:worker_threads')
const db = require('./db'), backup = require('./backup')
try {
  if (workerData.operation === 'inspect') parentPort.postMessage({ result: backup.inspect(workerData.source, workerData.password) })
  else { db.openForBackup(workerData.dataDir); parentPort.postMessage({ result: backup.run(workerData.folder, workerData.options) }) }
} catch (error) { parentPort.postMessage({ error: error.message }) }
finally { db.close() }
