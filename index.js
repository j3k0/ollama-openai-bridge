const express = require('express');
const axios = require('axios');
const bunyan = require('bunyan');
const { randomUUID } = require('crypto');
const app = express();
const port = parseInt(process.env.PORT || '3301');

// Configure Bunyan logger
const logger = bunyan.createLogger({ name: 'ollama-openai-bridge' });

app.use(express.json());

app.get('/v1/models', async (req, res) => {
  let req_id = req.headers['x-request-id'] || randomUUID();
  if (typeof req_id !== 'string') req_id = req_id.toString();
  const log = logger.child({req_id});
  log.info({ body: req.body }, 'Request received.');
  try {
    const options = {
      url: 'http://127.0.0.1:11434/api/tags',
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      }
    };

    let result = await makeRequest(log, options);
    log.info({ body: result }, 'Response');
    res.status(200).json({
      object: "models",
      data: result.models.map(model => ({
        id: model.name,
        object: "model",
        created: +new Date(model.modified_at),
        owned_by: model.name.split(':')[0],
      }))
    });
  } catch (error) {
    log.warn(error);
    res.status(400).end();
    // Log error
    log.error(`Error processing request: ${error}`);
  }
});

app.post('/v1/chat/completions', async (req, res) => {
  let req_id = req.headers['x-request-id'] || randomUUID();
  if (typeof req_id !== 'string') req_id = req_id.toString();
  const log = logger.child({req_id});
  log.info({ body: req.body }, 'Request received.');
  try {
    const options = {
      url: 'http://127.0.0.1:11434/api/chat',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      data: {
        ...req.body,
        stream: false,
      }
    };

    let result = await makeRequest(log, options);
    log.info({ body: result }, 'Response');
    res.status(200).json({
      id: req_id,
      created: +new Date(result.created_at),
      model: result.model,
      object: "chat.completion",
      choices: [{
        index: 0,
        message: result.message,
        finish_reason: "stop",
      }],
      usage: {
        // prompt_tokens: result.prompt_tokens,
        // completion_tokens: result.eval_count,
        // total_tokens: result.eval_count,
      },
      data: result
    });
  } catch (error) {
    log.warn(error);
    res.status(400).end();

    // Log error
    log.error(`Error processing request: ${error}`);
  }
});

app.use((req, res) => {
  res.status(404).end();
  // Log 404 error
  logger.warn(`404 - Not Found: ${req.url}`);
});

app.listen(port, () => {
  // Log server start
  logger.info(`Server is running on port ${port}`);
});

async function makeRequest(log, options) {
  const response = await axios(options);
  // log.info({data: response.data}, 'Response from API');
  return response.data;
} 
