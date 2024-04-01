//! DB-Connection:- Approch 2
import dotenv from "dotenv";
import connectDB from "./db/index.js";

dotenv.config({
    path: "./.env",
});

connectDB();

//! DB-Connection:- Approch 1
/* 
import mongoose from "mongoose";
import { DB_NAME } from "./constants";

import express from "express";
const app = express();

(async () => {
    try {
        await mongoose.connect(`${process.env.MONGODB_URI}/${DB_NAME}`);
        app.on("error", (error) => {
            console.log("Error: ", error);
            throw error;
        });

        app.listen(process.env.PORT, () => {
            console.log(`App is listening on port ${process.env.PORT}`);
        });
    } catch (err) {
        console.error("ERROR: ", err);
        throw err;
    }
})(); 
*/
