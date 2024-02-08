const express = require('express');
const axios = require('axios');
const bunyan = require('bunyan');
const { randomUUID } = require('crypto');
const app = express();
const port = parseInt(process.env.PORT || '3301');

const COMPLETE_MARK = '<REPLACE' + '_' + 'THIS>';

const owned_by = {
  'mistral': 'Mistral AI',
  'mixtral': 'Mistral AI',
  'llama2': 'Meta Platforms',
  'codellama': 'Meta Platforms',
  'phi': 'Microsoft',
  // more
};

// Configure Bunyan logger
const logger = bunyan.createLogger({ name: 'ollama-openai-bridge' });

app.use(express.json());

app.get('/v1/models', async (req, res) => {
  let req_id = req.headers['x-request-id'] || randomUUID();
  if (typeof req_id !== 'string') req_id = req_id.toString();
  const log = logger.child({req_id});
  log.info({ url: req.url, body: req.body }, 'Request received.');
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
        owned_by: owned_by[model.name.split(':')[0]] || 'Unknown',
      }))
    });
  } catch (error) {
    log.warn(error);
    res.status(400).end();
    // Log error
    log.error(`Error processing request: ${error}`);
  }
});


/**
 * Handles chat completion requests.
 * 
 * @param {Object} req - The request object.
 * @param {Object} res - The response object.
 * @param {string} forceModel - The model to force for completion (optional).
 * @returns {Promise<void>} - A promise that resolves when the completion is handled.
 */
async function chatCompletion(req, res, forceModel) {
  let req_id = req.headers['x-request-id'] || randomUUID();
  if (typeof req_id !== 'string') req_id = req_id.toString();
  const log = logger.child({req_id});
  log.info({ url: req.url, body: req.body }, 'Request received.');
  try {
    const options = {
      url: 'http://127.0.0.1:11434/api/chat',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      data: {
        ...req.body,
        model: req.body.model || forceModel,
        stream: false,
        options: {
          temperature: req.body.temperature || undefined,
          // test
        }
      }
    };

    let result = await makeRequest(log, options);
    log.info({ body: result.message }, 'Response');
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
}

/**
 * Handles generative completion requests (alternative implementation using chat)
 * 
 * @see {@link https://platform.openai.com/docs/api-reference/completions/create}
 * 
 * @param {Object} req - The request object.
 * @param {Object} res - The response object.
 * @param {string} forceModel - The model to force for completion (optional).
 * @returns {Promise<void>} - A promise that resolves when the completion is handled.
 */
async function engineCompletionsAlt(req, res, forceModel) {
  let req_id = req.headers['x-request-id'] || randomUUID();
  if (typeof req_id !== 'string') req_id = req_id.toString();
  const log = logger.child({req_id});
  log.info({ url: req.url, ...req.body }, 'Engine Completions Alt: Request received.');
  // log.info('Engine Completions Alt: Request received.');
  try {
    const messages = [];
    const {extra, prompt,suffix} = req.body;
    let language = extra && extra.language || 'text';
    messages.push({
      role: 'system',
      content: `Your role is to complete a block of ${language}. I'll send you the code with a ${COMPLETE_MARK} tag. Respond with the text that goes in place of ${COMPLETE_MARK}.`
    });
    if (!suffix) {
      messages.push({
        role: 'user',
        content: `${prompt} ${COMPLETE_MARK}`,
      });
    }
    else {
      messages.push({
        role: 'user',
        content: `${prompt} ${COMPLETE_MARK}\n${suffix}`,
      });
    }
    messages.push({
      role: 'user',
      content: `Remember, you should only respond with the actual block that has to be inserted in place of ${COMPLETE_MARK}. Do not make a sentence. Just respond with this text.`
    });
    const options = {
      url: 'http://127.0.0.1:11434/api/chat',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      data: {
        model: forceModel || req.body.model,
        messages,
        options: {
          temperature: req.body.temperature || undefined,
        },
        stream: false,
      }
    };

    let result = await makeRequest(log, options);
    const prompt_tokens = result.prompt_eval_count;
    const completion_tokens = result.eval_count;
    const response = {
      id: 'cmpl-' + req_id,
      object: "text_completion",
      created: +new Date(result.created_at),
      model: result.model,
      system_fingerprint: `openollamai:${result.model}`,
      choices: [{
        text: result.message.content + req.body.stop[0],
        index: 0,
        logprobs: null,
        finish_reason: "length" // result.done ? "stop" : "length",
      }],
      usage: {
        prompt_tokens,
        completion_tokens,
        total_tokens: prompt_tokens + completion_tokens,
      },
    };
    log.info({ response }, 'Response to user request');
    res.status(200).json(response);
  } catch (error) {
    log.warn(error);
    res.status(400).end();

    // Log error
    log.error(`Error processing request: ${error}`);
  }
}
/**
 * Handles generative completion requests.
 * 
 * @see {@link https://platform.openai.com/docs/api-reference/completions/create}
 * 
 * @param {Object} req - The request object.
 * @param {Object} res - The response object.
 * @param {string} forceModel - The model to force for completion (optional).
 * @returns {Promise<void>} - A promise that resolves when the completion is handled.
 */
async function engineCompletions(req, res, forceModel) {
  let req_id = req.headers['x-request-id'] || randomUUID();
  if (typeof req_id !== 'string') req_id = req_id.toString();
  const log = logger.child({req_id});
  log.info({ url: req.url, body: req.body }, 'Request received.');
  try {
    const options = {
      url: 'http://127.0.0.1:11434/api/generate',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      data: {
        ...req.body,
        stream: false,
      }
    };
    if (forceModel) {
      options.data.model = forceModel;
    }

    let result = await makeRequest(log, options);
    log.info({ response: result.response }, 'Response');
    res.status(200).json({
      id: req_id,
      object: "text_completion",
      created: +new Date(result.created_at),
      model: result.model,
      system_fingerprint: "ollama-openai-bridge",
      choices: [{
        index: 0,
        text: result.response,
        finish_reason: result.done ? "stop" : "length",
      }],
      usage: {
        // prompt_tokens: result.prompt_tokens,
        // completion_tokens: result.eval_count,
        // total_tokens: result.eval_count,
      },
      // data: result
    });
  } catch (error) {
    log.warn(error);
    res.status(400).end();

    // Log error
    log.error(`Error processing request: ${error}`);
  }
}

app.post('/v1/completions', async (req, res) => {
  engineCompletionsAlt(req, res);
});

app.post('/v1/engines/:engine/completions', async (req, res) => {
  engineCompletionsAlt(req, res, req.params.engine);
});

app.post('/v1/chat/completions', async (req, res) => {
  chatCompletion(req, res, null);
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
  try {
    log.info(options, 'Request to API');
    const response = await axios(options);
    log.info(response.data, 'Response from API');
    return response.data;
  }
  catch (err) {
    log.error(err, 'API call failed');
    throw err;
    // 
  }
} 