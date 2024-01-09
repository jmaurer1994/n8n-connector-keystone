# n8n-connector-keystone
Used to remotely execute specified tasks on ADMFIN01 in support of Keystone.

## Overview
This script works by running an https webserver that listens for requests from n8n. The endpoint is secured via TOTP - a secret is shared between the script and n8n and time-based tokens are sent/validated with each request.

## Webserver Endpoint
The webserver listens at the endpoint defined by the following schema:
```
{
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
                    task_status: { type: 'string' }
                }
            }
        }
    }
}
```

where `task_type` must be one of `'hhjs'`, `'fusion'`, or `'write-file'` and `task` is a valid entry in the specified task file.

`task_status` will be either success or fail for error handling in n8n.

## Task Files 
Task files are located in ./tasks and are used to define which types of tasks the server can perform.

Task files must be valid json, and options for each are outline below
### HHJS Tasks JSON format
"args" not yet supported for setting input parameters

```
{
    "YOUR TASK NAME": {
        "command": "script.bat",
        "args": null
    }
}
```

### Fusion Tasks JSON format
Setting false or removing the program will prevent the script from being able to execute it.

```
    {
        "FUSION_PROGRAM_NAME": true
    }
```

### Write File Tasks JSON format
Define a task to write a binary stream to file at a specified location.

```
    {
        "WRITE_FILE_TASK_NAME": {
            destination: "C:\\path\\to\\desination\\filename.ext"
        }
        "OTHER_WRITE_FILE_TASK_NAME": {
            destination: "C:/path/to/other/desination/filename.ext"
        }
    }
```