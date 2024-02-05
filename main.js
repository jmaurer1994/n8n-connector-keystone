const { spawn } = require('node:child_process');
const { writeFile } = require('node:fs/promises');
const { readFileSync } = require('node:fs')
const path = require('node:path')
const totp = require("totp-generator");

console.log("Configuring environment");
require('dotenv').config();
const logFileName = `out-${Date.now()}`;

console.log("Loading task files");
const writefTasks = loadTaskFile('write_file_tasks.json');
const hhjsTasks = loadTaskFile('hhjs_tasks.json');
const fusionTasks = loadTaskFile('fusion_tasks.json');

console.log("Starting web server");
const fastify = require('fastify')({
    logger: {
        level: process.env['FASTIFY_LOG_LEVEL'],
        file: path.join(__dirname, 'logs',  logFileName),
    },
    https: {
        key: readFileSync(process.env['FASTIFY_SSL_KEY']),
        cert: readFileSync(process.env['FASTIFY_SSL_CERT'])
    }
})

//initialize TOTP generator with same settings as n8n
const tokenOpts = {
    digits: 8
};

fastify.addContentTypeParser('text/plain', { parseAs: 'buffer' }, function (req, body, done) {
    try {
        done(null, body)
    } catch (err) {
        err.statusCode = 400
        done(err, undefined)
    }
})

fastify.route({
    method: 'POST',
    url: '/',
    schema: {
        querystring: {
            task_type: { type: 'string' },
            task: { type: 'string' }
        },
        response: {
            200: {
                type: 'object',
                properties: {
                    status: { type: 'string' }
                }
            }
        }
    },
    handler: function (request, reply) {
        const { task_type, task } = request.query;

        const token = request.headers.authorization;

        if (!validateTOTPToken(token)) {
            fastify.log.error(`<${request.ip}> invalid token provided`);
            reply.status(401).send(); return;
        }

        fastify.log.info(`<${request.ip}> validated TOTP token`);
        let responseData;

        fastify.log.info(`<${request.ip}> processing ${task_type.toUpperCase()} task: ${task}`)
        switch (task_type.toLowerCase()) {
            case 'fusion':
                responseData = spawnFusionTask(task);
                break;
            case 'hhjs':
                responseData = spawnHHJSTask(task);
                break;
            case 'write-file':
                responseData = writeFileTask(task, request.body);
                break;
        }

        if (!responseData) {
            fastify.log.error(`<${request.ip}> Task not ran`);
            reply.status(502).send(); return;
        }

        responseData.then((data) => {
            fastify.log.info(`<${request.ip}> Executed ${task_type.toUpperCase()} ${task}`);
            if (data) {
                fastify.log.info(`<${request.ip}> ${data}`)
            }
            reply.send({ status: 'success' }); return;
        }).catch((err) => {
            fastify.log.error(`<${request.ip}> Encountered error: \n${err}`);
            reply.send({ status: 'error' }); return;
        });
    }
});

fastify.listen({ port: process.env['FASTIFY_PORT'], host: '0.0.0.0' }, function (err, address) {
    if (err) {
        fastify.log.error(err);
        process.exit(1);
    }
})

console.log(`Server started, logging output to ${ path.join(__dirname, 'logs', logFileName)}`);

/*******
 * 
 */

function loadTaskFile(taskFileName) {
    try{
        const taskFileData = readFileSync(path.join(__dirname, 'tasks', taskFileName));
        return JSON.parse(taskFileData);
    } catch(e){
        console.log(`Error opening ${taskFileName}:\n\t${e}`);
        process.exit(1);
    }
}

function validateTOTPToken(tokenToValidate) {
    try {
        const calculatedToken = totp(process.env['N8N_TOTP_SECRET_PASSPHRASE'], { ...tokenOpts });
        return tokenToValidate === calculatedToken;

    } catch (e) {
        fastify.log.error(`Could not generate TOTP - check ENV var`);
        return false;
    }
}

function writeFileTask(task, data) {
    if (writefTasks[task]) {
        const { destination } = writefTasks[task]
        return writeFile(destination, data);
    }
    fastify.log.error(`${task} not found in write files task list`)
    return null
}

function spawnHHJSTask(command) {
    //template the options for running fusion programs
    if (hhjsTasks[command]) {
        const hhjsTaskParams = {
            command: hhjsTasks[command].command, //user provided
            args: hhjsTasks[command].args, //user provided array of strings
            spawnOptions: {
                cwd: process.env['HHJS_DIRECTORY'],
                shell: true,
                timeout: process.env['HHJS_TASK_TIMEOUT_MINUTES'] * (60 * 1000), //input is milliseconds, timeout after 25min 
            }
        };
		
		return spawnTask(hhjsTaskParams);
    }
    fastify.log.error(`${command} not found in HHJS task list`)
    return null
}

function spawnFusionTask(fpgm) {
    if (fusionTasks[fpgm]) {
    const fpgmTaskParams = {
        command: process.env['UV_EXE'],
        args: ["RUN", "ZBSPEC", fpgm], //user provides last arg
        spawnOptions: {
            cwd: process.env['FUSION_DIRECTORY'],
            shell: true,
            timeout: process.env['FUSION_TASK_TIMEOUT_MINUTES'] * (60 * 1000), //input is milliseconds, timeout after 15min
        }
    }

    return spawnTask(fpgmTaskParams);
    }

    fastify.log.error(`${fpgm} not found in fpgm task list`);
}

function spawnTask({command, args, spawnOptions}) {
    return new Promise((resolve, reject) => {
        const buffer = [];
        const errBuffer = [];
        const process = spawn(command, args, spawnOptions);
        process.stdout.on('data', (data) => {
            buffer.push(data)
        });

        process.stderr.on('data', (data) => {
            errBuffer.push(data)
        });

        process.on('close', (exitCode) => {
            fastify.log.info(`Child process exited with code ${exitCode}`)
			const returnData = {
                exitCode,
                stdout: buffer.join(' '),
                stderr: errBuffer.join(' ')
            }
			
            exitCode === 0 ? resolve(returnData) : reject(returnData); return;
        })
    });
}