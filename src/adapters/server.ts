// import express from "express";
import { Logger } from "winston";

// const app = express();
// const port = process.env.PORT || 3000;

export const setupApp = (
    _logger: Logger,
) => {
    // app.get("/", async (_req, res) => {

    //     res.write(`
    //     <html>
    //         <head>
    //         <title>ChaosDEX Trading Bot</title>
    //         </head>
    //         <style>
    //         body {
    //             background-color: #f8f9fa;
    //             padding: 20px;
    //             font-family:sans-serif;
    //             color: #333;
    //         }
    //         .section {
    //             box-shadow: 0 .5rem 1.2rem rgba(189,197,209,.2);
    //             border: 1px solid #e7eaf3;
    //             border-radius: .25rem;
    //             padding: 20px;
    //             margin: 0 auto;
    //             max-width: 1000px;
    //             margin-bottom: 20px;
    //         }
    //         .terminal {
    //             padding: 20px;
    //             background: #333;
    //             color: #eee;
    //             max-height: 380px;
    //             overflow-y: scroll;
    //         }
    //         .history {
    //             padding: 0 20px;
    //             max-height: 380px;
    //             overflow-y: scroll;
    //         }
    //         </style>
    //         <body>
    //             <div class="section">
    //                 <h1>ChaosDEX Trading Bot</h1>
    //                 <p style="color: green">Online</p>
    //             </div>
    //             <div class="section">
    //                 <h3>Balances</h3>
    //                 <span class="loading1">Loading...</span>
    //              </div>
    //          </body>
    //      </html>`
    //     );
    // });

    // app.listen(port, () =>
    //     logger.info(`Trading bot listening on port ${port}!`),
    // );
};
