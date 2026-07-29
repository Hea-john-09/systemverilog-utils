# SystemVerilog Utils

Generate named SystemVerilog module instantiations directly from a selected module declaration.

## Features

- Parse ANSI and named non-ANSI module headers.
- Handle parameter lists with nested parentheses, braces, arrays, comments, and strings.
- Recognize grouped ports, unpacked arrays, and interface/modport declarations.
- Replace the selected declaration with an instantiation.
- Copy the generated instantiation without modifying the editor.
- Configure the instance prefix and connection alignment.

## Usage

1. Select a complete declaration from `module` through the closing header `);`.
2. Open the Command Palette or editor context menu.
3. Run one of:
   - `SystemVerilog Utils: Replace Selection with Module Instantiation`
   - `SystemVerilog Utils: Copy Module Instantiation`

Example input:

```systemverilog
module packet_fifo #(
  parameter int WIDTH = 32
) (
  input  logic             clk,
  input  logic             rst_n,
  input  logic [WIDTH-1:0] data_i,
  output logic [WIDTH-1:0] data_o
);
```

Generated output:

```systemverilog
packet_fifo #(
    .WIDTH  ( WIDTH )
) u_packet_fifo (
    .clk    ( clk ),
    .rst_n  ( rst_n ),
    .data_i ( data_i ),
    .data_o ( data_o )
);
```

## Settings

- `systemverilogUtils.instancePrefix`: generated instance-name prefix. Default: `u_`.
- `systemverilogUtils.alignConnections`: align connection columns. Default: `true`.

## Known limitations

The parser focuses on module headers. Preprocessor macros that expand into complete parameter or port declarations cannot be resolved without running a SystemVerilog preprocessor.

## Development

```powershell
npm ci
npm test
npm run test:integration
npm run package:vsix
```

## License

MIT
