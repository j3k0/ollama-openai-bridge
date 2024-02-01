# ollama-openai-bridge

> Expose Ollama's local LLM models as an OpenAI compatible API

## Description

The motivation was to use services that consume the OpenAI API, but with my locally installed LLM run by
Ollama. It's been tested successfully with GitLens's "Explain with AI". 

## Usage

Make sure you have installed Ollama. If not, follow the instructions from their website: https://ollama.ai/

Install your preferred Language Model, for example `ollama pull mistral:latest`

```sh
npm install
```

Start the server:

```sh
npm start
```

Test it:

```sh
curl -s http://localhost:3301/v1/chat/completions -H "Content-Type: application/json" -d '{
"model": "mistral:latest",
"messages": [{"role": "user", "content": "Tell me a joke."}]
}' | jq
```

## Link with gitlens

In VSCode's `settings.json`. Gitlens might ask for an API key, anything should work.

```js
{
  //...
  "gitlens.ai.experimental.provider": "openai",
  "gitlens.ai.experimental.openai.url": "http://127.0.0.1:3301/v1/chat/completions",
  "gitlens.ai.experimental.openai.model": "mistral:latest", // or your favorite
}
```

## Copyright

(c) 2024, Jean-Christophe Hoelt

License Apache 2.0