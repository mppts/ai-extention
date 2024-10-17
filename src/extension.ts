import * as vscode from 'vscode';
import OpenAI from 'openai';
import { Marked } from 'marked';
import { markedHighlight } from "marked-highlight";
import hljs from 'highlight.js';

const models: Record<string, {
	name: string,
	cost_per_1000_prompt_tokens: number,
	cost_per_1000_completion_token: number
}> = {
	'gpt-4o-mini': {
		name: 'gpt-4o',
		cost_per_1000_prompt_tokens: 0.005,
		cost_per_1000_completion_token: 0.015,
	},
	'gpt-4o': {
		name: 'gpt-4o-mini',
		cost_per_1000_prompt_tokens: 0.00015,
		cost_per_1000_completion_token: 0.0006,
	}
}


export function activate(context: vscode.ExtensionContext) {
	let disposable = vscode.commands.registerCommand('codabra.refactorWithChatGPT', async () => {
		const selectedModel = models['gpt-4o-mini'];
		const editor = vscode.window.activeTextEditor;
		if (!editor) {
			vscode.window.showErrorMessage('No file is open.');
			return;
		}

		// Get the document text
		const document = editor.document;
		const fileContent = document.getText();

		// Get the custom prompt and API key from settings
		const config = vscode.workspace.getConfiguration('codabra');
		const prompt = config.get<string>('prompt');
		const apiKey = config.get<string>('apiKey');

		if (!apiKey) {
			vscode.window.showErrorMessage('API key not provided. Please configure the API key.');
			return;
		}

		const panel = vscode.window.createWebviewPanel(
			'chatGPTRefactor',
			'ChatGPT Refactor Suggestion',
			vscode.ViewColumn.Beside,
			{
				enableScripts: true
			}
		);

		panel.webview.html = getLoadingSpinnerHTML();

		try {
			// Initialize OpenAI client with API key
			const openai = new OpenAI({ apiKey });

			// Make the OpenAI API request for chat completion (your version)
			const completion = await openai.chat.completions.create({
				model: "gpt-4o",
				messages: [
					{ role: "system", content: `You are an experienced software developer with deep knowledge of design and patterns. ${prompt}` },
					{ role: "user", content: fileContent }
				]
			});

			const refactoredCode = completion.choices[0].message.content ?? "no suggestions";

			const { prompt_tokens = 0, completion_tokens = 0, total_tokens = 0 } = completion.usage ?? {};

			const promptCost = (prompt_tokens / 1000) * selectedModel.cost_per_1000_prompt_tokens;
			const completionCost = (completion_tokens / 1000) * selectedModel.cost_per_1000_completion_token;
			const totalCost = promptCost + completionCost;


			const highlightExtention = markedHighlight({
				emptyLangClass: 'hljs',
				langPrefix: 'hljs language-',
				highlight(code, lang) {
					const language = hljs.getLanguage(lang) ? lang : 'plaintext';
					return hljs.highlight(code, { language }).value;
				}
			});
			// @ts-ignore
			const marked = new Marked(highlightExtention);


			const refactoredHTML = await marked.parse(refactoredCode);

			panel.webview.html = getWebviewContent(refactoredHTML, total_tokens, totalCost, selectedModel.name);

		} catch (error) {
			vscode.window.showErrorMessage(`Error fetching refactoring: ${(error as Error).message}`);
		}
	});

	context.subscriptions.push(disposable);
}

function getLoadingSpinnerHTML(): string {
	return `
	  <!DOCTYPE html>
	  <html lang="en">
	  <head>
		<meta charset="UTF-8">
		<meta name="viewport" content="width=device-width, initial-scale=1.0">
		<title>Loading...</title>
		<style>
		  body {
			font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
			margin: 0;
			padding: 20px;
			display: flex;
			justify-content: center;
			align-items: center;
			height: 100vh;
		  }
		  .spinner {
			border: 8px solid #f3f3f3;
			border-top: 8px solid #3498db;
			border-radius: 50%;
			width: 60px;
			height: 60px;
			animation: spin 2s linear infinite;
		  }
		  @keyframes spin {
			0% { transform: rotate(0deg); }
			100% { transform: rotate(360deg); }
		  }
		</style>
	  </head>
	  <body>
		<div class="spinner"></div>
	  </body>
	  </html>
	`;
}

function getWebviewContent(refactoredHTML: string, totalTokens: number, totalCost: number, modelName: string): string {
	return `
	  <!DOCTYPE html>
	  <html lang="en">
	  <head>
		<meta charset="UTF-8">
		<meta name="viewport" content="width=device-width, initial-scale=1.0">
		<title>Refactoring Suggestion</title>
		<style>
		  body {
			font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
			margin: 0;
			padding: 20px;
		  }
		  pre {
			background-color: #f5f5f5;
			padding: 10px;
			border-radius: 5px;
			white-space: pre-wrap;
		  }
		  code {
			font-family: Consolas, Monaco, 'Andale Mono', 'Ubuntu Mono', monospace;
		  }
		  /* Include highlight.js default theme */
		  ${hljsCSS()}
		</style>
	  </head>
	  <body>
		<h2>Refactoring Suggestion</h2>
		${refactoredHTML}
		<p>Model: ${modelName}</p>
		<p>Total tokens used: ${totalTokens}</p>
		<p>Estimated cost: $${totalCost.toFixed(4)} USD</p>
		<script src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.5.0/highlight.min.js"></script>
		<script>hljs.highlightAll();</script> <!-- Initialize highlight.js -->
	  </body>
	  </html>
	`;
}

function hljsCSS(): string {
	return `
	  .hljs { background: #f0f0f0; color: #333; }
	  .hljs-comment, .hljs-quote { color: #6f8f6f; font-style: italic; }
	  .hljs-keyword, .hljs-selector-tag, .hljs-subst { color: #000080; font-weight: bold; }
	  .hljs-literal, .hljs-number, .hljs-variable, .hljs-template-variable, .hljs-tag .hljs-attr { color: #b22222; }
	  .hljs-string, .hljs-doctag, .hljs-title, .hljs-section, .hljs-selector-id, .hljs-selector-class { color: #a31515; }
	`;
}

export function deactivate() { }