import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  generateInstantiation,
  parseModuleDeclaration,
  SystemVerilogParseError
} from '../../parser';

describe('SystemVerilog parser', () => {
  it('parses a simple ANSI module declaration', () => {
    const declaration = parseModuleDeclaration(`
      module pulse_sync (
        input  logic clk,
        input  logic rst_n,
        output logic pulse_out
      );
    `);

    assert.deepEqual(declaration, {
      name: 'pulse_sync',
      parameters: [],
      ports: ['clk', 'rst_n', 'pulse_out']
    });
  });

  it('keeps nested commas inside parameter expressions and strings', () => {
    const declaration = parseModuleDeclaration(`
      module packet_fifo #(
        parameter int WIDTH = max(8, $bits(my_pkg::header_t)),
        parameter string LABEL = "left,right",
        parameter type DATA_T = logic [WIDTH-1:0],
        parameter logic [15:0] RESET_DATA = '{8'h00, 8'hff}
      ) (
        input logic clk,
        input DATA_T data_i,
        output DATA_T data_o,
        input logic enable = 1'b0
      );
    `);

    assert.deepEqual(
      declaration.parameters,
      ['WIDTH', 'LABEL', 'DATA_T', 'RESET_DATA']
    );
    assert.deepEqual(declaration.ports, ['clk', 'data_i', 'data_o', 'enable']);
  });

  it('parses grouped ports, unpacked arrays, interfaces, and comments', () => {
    const declaration = parseModuleDeclaration(`
      /* module ignored(input fake); */
      module stream_router (
        input logic clk, rst_n,
        input logic [31:0] payload_i [4],
        axi_stream_if.slave source,
        axi_stream_if.master sink,
        // The comma below belongs to a function call.
        input logic enable = choose(1, 0)
      );
    `);

    assert.deepEqual(
      declaration.ports,
      ['clk', 'rst_n', 'payload_i', 'source', 'sink', 'enable']
    );
  });

  it('parses named non-ANSI ports', () => {
    const declaration = parseModuleDeclaration(`
      module legacy (.clock(clk_i), .reset_n(rst_ni), .result(result_o));
    `);

    assert.deepEqual(declaration.ports, ['clock', 'reset_n', 'result']);
  });

  it('ignores the word module inside attributes and strings', () => {
    const declaration = parseModuleDeclaration(`
      (* description = "module fake(input wrong);" *)
      module real_module (
        input string label = "module value",
        input logic valid
      );
    `);

    assert.equal(declaration.name, 'real_module');
    assert.deepEqual(declaration.ports, ['label', 'valid']);
  });

  it('throws a useful error when no module is selected', () => {
    assert.throws(
      () => parseModuleDeclaration('logic clk;'),
      (error: unknown) => {
        assert.ok(error instanceof SystemVerilogParseError);
        assert.match(error.message, /No module declaration/);
        return true;
      }
    );
  });

  it('generates aligned named parameter and port connections', () => {
    const generated = generateInstantiation(
      {
        name: 'packet_fifo',
        parameters: ['WIDTH', 'DATA_T'],
        ports: ['clk', 'rst_n', 'payload_i']
      },
      {
        instancePrefix: 'i_',
        alignConnections: true
      }
    );

    assert.equal(
      generated,
      [
        'packet_fifo #(',
        '    .WIDTH     ( WIDTH ),',
        '    .DATA_T    ( DATA_T )',
        ') i_packet_fifo (',
        '    .clk       ( clk ),',
        '    .rst_n     ( rst_n ),',
        '    .payload_i ( payload_i )',
        ');',
        ''
      ].join('\n')
    );
  });
});
