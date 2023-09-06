const { spawn } = require('node:child_process');
const express = require('express');
const totp = require("totp-generator");
const winston = require('winston');
require('dotenv').config()

//initialize the server
const app = express()
const port = 4042

//initialize TOTP generator with same settings as n8n
const tokenOpts = { 
    digits: 8
}
const passPhrase = process.env['n8n_SECRET_PASSPHRASE']

//template the options for running fusion programs
const fpgmSpawnOptions = {
    cwd: process.env['n8n_FUSION_DIRECTORY'],
    shell: true,
    timeout: 15*(60*1000), //input is milliseconds, timeout after 15min 
}

//configure logging
const logger = winston.createLogger({
    level: 'info',
    format: winston.format.json(),
    transports: [
        //
        // - Write all logs with importance level of `error` or less to `error.log`
        // - Write all logs with importance level of `info` or less to `combined.log`
        //
        new winston.transports.File({ filename: process.env['n8n_LOG_DIRECTORY'] + '/error.log', level: 'error' }),
        new winston.transports.File({ filename: process.env['n8n_LOG_DIRECTORY'] + '/combined.log' }),
    ],
});


app.get('/run-zbspec/:fpgm', (req, res) => {
    const { fpgm } = req.params
    const token = req.headers.authorization

    const calculatedToken = totp(passPhrase, tokenOpts)

    if (token === calculatedToken) {
        logger.info(`Receieved valid token from:    ${req.ip}`)
        logger.info(`Attempting to execute FPGM:    ${fpgm}`)
        
        const buffer = []
        const errBuffer = []
        const process = spawn(process.env['n8n_UV_EXE'], ["RUN", "ZBSPEC", fpgm], fpgmSpawnOptions)

        process.stdout.on('data', (data) => {
            buffer.push(data)            
        });

        process.stderr.on('data', (data) => {
            errBuffer.push(data)
        });

        process.on('close', (exitCode) => {
            logger.info(`Child process exited with code ${exitCode}`)
            res.send({
                stdout: buffer.join(' '),
                stderr: errBuffer.join(' ')
            })
        })
    } else {
        logger.warn(`Receieved invalid token from:\t${req.ip}`)
    }
})

app.listen(port, () => {
    logger.info(`n8n-keystone-connector listening on port ${port}`)
})