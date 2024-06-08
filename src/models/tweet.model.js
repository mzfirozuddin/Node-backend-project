import mongoose from "mongoose";

const tweetSchema = new mongoose.Schema(
    {
        content: {
            type: String,
            required: true,
        },
        image: {
            type: String, // Cloudinary url
        },
        owner: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
        },
    },
    { timestamps: true }
);

export const Tweet = mongoose.model("Tweet", tweetSchema);
