import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import jwt from "jsonwebtoken";
import { User } from "../models/user.model.js";

export const verifyJWT = asyncHandler(async (req, res, next) => {
    try {
        //: Get the token from cookies or header
        const token =
            req.cookies?.accessToken ||
            req.header("Authorization")?.replace("Bearer ", "");

        if (!token) {
            throw new ApiError(401, "Unauthorized Request!");
        }

        //: Decode the token
        const decodedToken = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);

        //: Get user data using id
        const user = await User.findById(decodedToken?._id).select(
            "-password -refreshToken"
        );

        if (!user) {
            throw new ApiError(401, "Invalid Access Token!");
        }

        //: add "user" object to req
        req.user = user;
        next();
    } catch (err) {
        throw new ApiError(401, err?.message || "Invalid Access Token!");
    }
});
