import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { User } from "../models/user.model.js";
import { uploadOnCloudinary } from "../utils/cloudinary.js";
import { ApiResponse } from "../utils/ApiResponse.js";

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

export { registerUser, loginUser, logoutUser };
