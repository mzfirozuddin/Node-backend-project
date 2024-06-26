import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { User } from "../models/user.model.js";
import {
    deleteFromCloudinary,
    uploadOnCloudinary,
} from "../utils/cloudinary.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";

const generateAccessAndRefreshTokens = async (userId) => {
    try {
        //: find user in DB
        const user = await User.findById(userId);

        //: generate accessToken and refreshToken for this user
        const accessToken = user.generateAccessToken();
        const refreshToken = user.generateRefreshToken();

        //: add refresh token in DB
        user.refreshToken = refreshToken;
        await user.save({ validateBeforeSave: false }); // If we don't write "validateBeforeSave: false", mongoose schema will throw error

        //: return accessToken and refreshToken
        return { accessToken, refreshToken };
    } catch (err) {
        throw new ApiError(
            500,
            "Something went wrong while generating access and refresh token!"
        );
    }
};

const registerUser = asyncHandler(async (req, res) => {
    //: get user details from frontend
    const { username, email, fullName, password } = req.body;
    // console.log(req.body);

    //: validation - not empty
    // we can check one by one
    /* 
    if (fullName === "") {
        throw new ApiError(400, "FullName is required!");
    } 
    */
    // OR we can check together
    if (
        [username, email, fullName, password].some(
            (field) => field?.trim() === ""
        )
    ) {
        throw new ApiError(400, "All fields are required!");
    }

    //: check if user already exists: username and email
    const existedUser = await User.findOne({ $or: [{ username }, { email }] });
    if (existedUser) {
        throw new ApiError(409, "User with email or username already exists");
    }

    //: check for files(images)
    // console.log("Req.Files: ", req.files);
    // const avatarLocalPath = req.files?.avatar[0]?.path;  //! This works, but the error we are getting is different.
    let avatarLocalPath;
    if (
        req.files &&
        Array.isArray(req.files.avatar) &&
        req.files.avatar.length > 0
    ) {
        avatarLocalPath = req.files.avatar[0].path;
    }

    if (!avatarLocalPath) {
        throw new ApiError(400, "Avatar file is required!");
    }

    // const coverImageLocalPath = req.files?.coverImage[0]?.path;  //! This will not work, because coverImage is optional field
    let coverImageLocalPath;
    if (
        req.files &&
        Array.isArray(req.files.coverImage) &&
        req.files.coverImage.length > 0
    ) {
        coverImageLocalPath = req.files.coverImage[0].path;
    }

    //: upload files on cloudinary
    const avatar = await uploadOnCloudinary(avatarLocalPath);
    // console.log("Avatar: ", avatar);
    const coverImage = await uploadOnCloudinary(coverImageLocalPath);
    if (!avatar) {
        throw new ApiError(
            500,
            "Something went wrong while upload file on cloudinary."
        );
    }

    //: create user object - create entry in DB
    const user = await User.create({
        username: username.toLowerCase(),
        fullName,
        email,
        password,
        avatar: avatar.url,
        coverImage: coverImage?.url || "",
    });

    //: check for user creation and remove "password" and "refresh_token" field from response
    const createdUser = await User.findById(user._id).select(
        "-password -refreshToken"
    );
    if (!createdUser) {
        throw new ApiError(
            500,
            "Something went wrong while registering the user!"
        );
    }

    //: return response
    return res
        .status(201)
        .json(
            new ApiResponse(200, createdUser, "User registered successfully.")
        );
});

const loginUser = asyncHandler(async (req, res) => {
    //: get user details from frontend
    const { username, email, password } = req.body;

    //: validation - not empty
    if (!(username || email)) {
        throw new ApiError(400, "Username or Email is required for login!");
    }

    if (!password) {
        throw new ApiError(400, "Password is required for login!");
    }

    //: Check user exist or not
    const user = await User.findOne({ $or: [{ username }, { email }] });
    if (!user) {
        throw new ApiError(404, "User does not exist!");
    }

    //: check password is correct or not
    // Our custom methods are accessable in "user" not in "User"
    const isPasswordValid = await user.isPasswordCorrect(password);
    if (!isPasswordValid) {
        throw new ApiError(401, "Invalid user credentials!");
    }

    //: generate access and refresh tokens
    const { accessToken, refreshToken } = await generateAccessAndRefreshTokens(
        user._id
    );

    //: fetch user data from DB (keep in your head that if DB calls are expensive then don't do this, Make changes in previous "user")
    const loggedInUser = await User.findById(user._id).select(
        "-password -refreshToken"
    );

    //: set cookies and return response
    const options = {
        httpOnly: true,
        secure: true,
    };

    return res
        .status(200)
        .cookie("accessToken", accessToken, options)
        .cookie("refreshToken", refreshToken, options)
        .json(
            new ApiResponse(
                200,
                {
                    user: loggedInUser,
                    accessToken,
                    refreshToken,
                },
                "User logged in successfully."
            )
        );
});

const logoutUser = asyncHandler(async (req, res) => {
    await User.findByIdAndUpdate(
        req.user._id,
        {
            // $set: {    //? $set is not working in my case
            //     refreshToken: undefined,
            // },

            $unset: {
                refreshToken: 1,
            },
        },
        {
            new: true,
        }
    );

    const options = {
        httpOnly: true,
        secure: true,
    };

    return res
        .status(200)
        .clearCookie("accessToken", options)
        .clearCookie("refreshToken", options)
        .json(new ApiResponse(200, {}, "User logged out successfully."));
});

const renewAccessAndRefreshToken = asyncHandler(async (req, res) => {
    //: Get the token from cookies or body or header
    const incommingRefreshToken =
        req.cookies.refreshToken || req.body.refreshToken;

    if (!incommingRefreshToken) {
        throw new ApiError(401, "Unauthorized Access!");
    }

    try {
        //: Decode the token
        const decodedToken = jwt.verify(
            incommingRefreshToken,
            process.env.REFRESH_TOKEN_SECRET
        );

        //: Check user details in DB
        const user = await User.findById(decodedToken?._id);
        if (!user) {
            throw new ApiError(401, "Invalid refresh token!");
        }

        //: Now check incommingRefreshToken with DB stored refreshToken (user.refreshToken)
        if (incommingRefreshToken !== user.refreshToken) {
            throw new ApiError(401, "Refresh token is expired or used!");
        }

        //: Generate new access and refresh tokens
        const { accessToken, refreshToken } =
            await generateAccessAndRefreshTokens(user._id);

        //: set new access and refresh tokens in cookies and return response
        const options = {
            httpOnly: true,
            secure: true,
        };

        return res
            .status(200)
            .cookie("accessToken", accessToken, options)
            .cookie("refreshToken", refreshToken, options)
            .json(
                new ApiResponse(
                    200,
                    { accessToken, refreshToken },
                    "New accessToken and refreshToken generate successfully."
                )
            );
    } catch (err) {
        throw new ApiError(401, err?.message || "INVALID REFRESH TOKEN");
    }
});

const changeCurrentPassword = asyncHandler(async (req, res) => {
    //: get required details from user
    const { oldPassword, newPassword, confirmNewPassword } = req.body;

    //: Validation - Not empty
    if (
        [oldPassword, newPassword, confirmNewPassword].some(
            (field) => field?.trim() === ""
        )
    ) {
        throw new ApiError(400, "All fields are required!");
    }

    //: check newPassword and confirmNewPassword are same or not
    if (newPassword !== confirmNewPassword) {
        throw new ApiError(
            401,
            "NewPassword and ConfirmNewPassword are not matched!"
        );
    }

    //: get userId from req.user (Auth middleware) and find the user form DB
    const user = await User.findById(req.user?._id);
    if (!user) {
        throw new ApiError(401, "Unauthorized access!");
    }

    //: Now match "oldPassword" with DB_stored password
    const isPasswordValid = await user.isPasswordCorrect(oldPassword);
    if (!isPasswordValid) {
        throw new ApiError(400, "Invalid old password!");
    }

    //: set newPassword in "user" object and store it in DB
    user.password = newPassword;
    await user.save({ validateBeforeSave: false });

    //: return response
    return res
        .status(200)
        .json(new ApiResponse(200, {}, "Password changed successfully."));
});

const getCurrentUser = asyncHandler(async (req, res) => {
    //: get "user" object from req.user (Auth middleware) and return as response
    const user = req.user;
    return res
        .status(200)
        .json(new ApiResponse(200, user, "Current user fetched successfully."));
});

const updateAccountDetails = asyncHandler(async (req, res) => {
    //: get required details from user that user wants to update
    const { fullName, email } = req.body;

    //: Validation - not empty
    if (!fullName || !email) {
        throw new ApiError(400, "All fields are required!");
    }

    //: get user from DB and update details
    const user = await User.findByIdAndUpdate(
        req.user?._id,
        {
            // $set: {
            //     fullName: fullName,
            //     email: email,
            // },

            //? ES6 synatx
            $set: {
                fullName,
                email,
            },
        },
        { new: true }
    ).select("-password -refreshToken");

    //: return response
    return res
        .status(200)
        .json(
            new ApiResponse(200, user, "Account details updated successfully.")
        );
});

const updateUserAvatar = asyncHandler(async (req, res) => {
    //: get avatar file from req.file(multer middleware)
    const avatarLocalPath = req.file?.path;
    if (!avatarLocalPath) {
        throw new ApiError(400, "Avatar file is required!");
    }

    //: Upload file on cloudinary
    const avatar = await uploadOnCloudinary(avatarLocalPath);
    if (!avatar.url) {
        throw new ApiError(400, "Error while uploading avatar on cloudinary!");
    }

    //: update avatar url in DB
    const user = await User.findByIdAndUpdate(
        req.user?._id,
        {
            $set: {
                avatar: avatar.url,
            },
        },
        { new: true }
    ).select("-password -refreshToken");

    //: remove old avatar image from cloudinary
    //http://res.cloudinary.com/drqredubp/image/upload/v1713696377/ebgjbyqecwll1bpolifa.png
    const avatarCloudinaryPath = req.user?.avatar.split("/");
    const cloudinaryAvatarName =
        avatarCloudinaryPath[avatarCloudinaryPath.length - 1].split(".")[0];
    console.log(cloudinaryAvatarName);
    const response = await deleteFromCloudinary(cloudinaryAvatarName);
    console.log("Controller: ", response);

    //: return response
    return res
        .status(200)
        .json(new ApiResponse(200, user, "Avatar updated successfully."));
});

const updateUserCoverImage = asyncHandler(async (req, res) => {
    //: get avatar file from req.file(multer middleware)
    const coverImageLocalPath = req.file?.path;
    if (!coverImageLocalPath) {
        throw new ApiError(400, "Cover image file is required!");
    }

    //: Upload file on cloudinary
    const coverImage = await uploadOnCloudinary(coverImageLocalPath);
    if (!coverImage.url) {
        throw new ApiError(
            400,
            "Error while uploading cover image on cloudinary!"
        );
    }

    //: update coverImage url in DB
    const user = await User.findByIdAndUpdate(
        req.user?._id,
        {
            $set: {
                coverImage: coverImage.url,
            },
        },
        { new: true }
    ).select("-password -refreshToken");

    //: remove old cover image from cloudinary
    const coverImageCloudinaryPath = req.user?.coverImage.split("/");
    const cloudinaryCoverImageName =
        coverImageCloudinaryPath[coverImageCloudinaryPath.length - 1].split(
            "."
        )[0];
    console.log(cloudinaryCoverImageName);
    const response = await deleteFromCloudinary(cloudinaryCoverImageName);
    console.log("Controller: ", response);

    //: return response
    return res
        .status(200)
        .json(new ApiResponse(200, user, "Cover image updated successfully."));
});

const getUserChannelProfile = asyncHandler(async (req, res) => {
    //: Get username from req.params   // Eg: youTube.com/channel?=chai-aur-code
    const { username } = req.params;

    //: check username present in params or not
    if (!username?.trim()) {
        throw new ApiError(400, "Username is missing!");
    }

    try {
        //: write aggregation pipeline for joining with subscription model
        const channel = await User.aggregate([
            {
                $match: {
                    username: username?.toLowerCase(), // get user details using username
                },
            },
            {
                $lookup: {
                    from: "subscriptions", // joining with subscription model for subscribers count
                    localField: "_id",
                    foreignField: "channel",
                    as: "subscribers",
                },
            },
            {
                $lookup: {
                    from: "subscriptions", // joining with subscription model for subscribed channel count
                    localField: "_id",
                    foreignField: "subscriber",
                    as: "subscribedTo",
                },
            },
            {
                $addFields: {
                    subscribersCount: {
                        $size: "$subscribers", // add subscribersCount field
                    },
                    channelsSubscribedToCount: {
                        $size: "$subscribedTo", // add channels Subscribed Count field
                    },
                    isSubscribed: {
                        // check if i am a subscriber or not of this channel
                        $cond: {
                            if: {
                                $in: [req.user?._id, "$subscribers.subscriber"],
                            },
                            then: true,
                            else: false,
                        },
                    },
                },
            },
            {
                $project: {
                    fullName: 1,
                    username: 1,
                    avatar: 1,
                    coverImage: 1,
                    subscribersCount: 1,
                    channelsSubscribedToCount: 1,
                    isSubscribed: 1,
                },
            },
        ]);
        // console.log("Channel: ", channel);

        //: If channel is not exists
        if (!channel?.length) {
            throw new ApiError(404, "Channel does not exists!");
        }

        //: Return response
        return res
            .status(200)
            .json(
                new ApiResponse(
                    200,
                    channel[0],
                    "User channel fetched successfully."
                )
            );
    } catch (err) {
        throw new ApiError(
            500,
            "Somthing went wrong while fetching user channel profile!"
        );
    }
});

const getWatchHistory = asyncHandler(async (req, res) => {
    const user = await User.aggregate([
        {
            $match: {
                _id: new mongoose.Types.ObjectId(req.user._id),
            },
        },
        {
            $lookup: {
                from: "videos",
                localField: "watchHistory",
                foreignField: "_id",
                as: "watchHistory",
                pipeline: [
                    {
                        $lookup: {
                            from: "users",
                            localField: "owner",
                            foreignField: "_id",
                            as: "owner",
                            pipeline: [
                                {
                                    $project: {
                                        fullName: 1,
                                        username: 1,
                                        avatar: 1,
                                    },
                                },
                            ],
                        },
                    },
                    {
                        $addFields: {
                            owner: {
                                $first: "$owner",
                            },
                        },
                    },
                ],
            },
        },
    ]);

    return res
        .status(200)
        .json(
            new ApiResponse(
                200,
                user[0].watchHistory,
                "Watch history fetched successfully."
            )
        );
});

export {
    registerUser,
    loginUser,
    logoutUser,
    renewAccessAndRefreshToken,
    changeCurrentPassword,
    getCurrentUser,
    updateAccountDetails,
    updateUserAvatar,
    updateUserCoverImage,
    getUserChannelProfile,
    getWatchHistory,
};
