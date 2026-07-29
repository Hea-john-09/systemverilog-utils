import * as vscode from 'vscode';
import {
  generateInstantiation,
  parseModuleDeclaration,
  SystemVerilogParseError
} from './parser';

const REPLACE_COMMAND = 'systemverilog-utils.replaceWithInstantiation';
const COPY_COMMAND = 'systemverilog-utils.copyInstantiation';

export function activate(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerTextEditorCommand(
      REPLACE_COMMAND,
      async (editor, editBuilder) => {
        const generated = generateFromSelection(editor);
        if (!generated) {
          return;
        }
        editBuilder.replace(editor.selection, generated);
      }
    ),
    vscode.commands.registerTextEditorCommand(
      COPY_COMMAND,
      async (editor) => {
        const generated = generateFromSelection(editor);
        if (!generated) {
          return;
        }
        await vscode.env.clipboard.writeText(generated);
        void vscode.window.showInformationMessage(
          'SystemVerilog module instantiation copied to the clipboard.'
        );
      }
    )
  );
}

export function deactivate(): void {}

function generateFromSelection(editor: vscode.TextEditor): string | undefined {
  if (editor.selection.isEmpty) {
    void vscode.window.showWarningMessage(
      'Select a complete SystemVerilog module declaration first.'
    );
    return undefined;
  }

  try {
    const declaration = parseModuleDeclaration(
      editor.document.getText(editor.selection)
    );
    const configuration = vscode.workspace.getConfiguration('systemverilogUtils');
    const generated = generateInstantiation(declaration, {
      instancePrefix: configuration.get<string>('instancePrefix', 'u_'),
      alignConnections: configuration.get<boolean>('alignConnections', true)
    });
    return useDocumentEndOfLine(generated, editor.document.eol);
  } catch (error) {
    const message = error instanceof SystemVerilogParseError
      ? error.message
      : error instanceof Error
        ? error.message
        : String(error);
    void vscode.window.showErrorMessage(`SystemVerilog Utils: ${message}`);
    return undefined;
  }
}

function useDocumentEndOfLine(text: string, eol: vscode.EndOfLine): string {
  return eol === vscode.EndOfLine.CRLF
    ? text.replace(/\n/g, '\r\n')
    : text;
}
