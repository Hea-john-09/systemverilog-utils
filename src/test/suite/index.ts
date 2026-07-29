import * as assert from 'node:assert/strict';
import * as vscode from 'vscode';

export async function run(): Promise<void> {
  const source = [
    'module counter #(',
    '  parameter int WIDTH = 8',
    ') (',
    '  input logic clk,',
    '  input logic rst_n,',
    '  output logic [WIDTH-1:0] count',
    ');'
  ].join('\n');

  const document = await vscode.workspace.openTextDocument({
    language: 'systemverilog',
    content: source
  });
  const editor = await vscode.window.showTextDocument(document);
  editor.selection = new vscode.Selection(
    document.positionAt(0),
    document.positionAt(source.length)
  );

  await vscode.commands.executeCommand(
    'systemverilog-utils.replaceWithInstantiation'
  );

  assert.match(document.getText(), /^counter #\(/);
  assert.match(document.getText(), /\.WIDTH\s+\( WIDTH \)/);
  assert.match(document.getText(), /\.count\s+\( count \)/);
  assert.match(document.getText(), /\) u_counter \(/);

  await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
}
