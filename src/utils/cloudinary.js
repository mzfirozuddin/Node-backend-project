import { v2 as cloudinary } from "cloudinary";
import fs from "fs";
import dotenv from "dotenv";
dotenv.config({
    path: "./.env",
});

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUDE_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
});

// console.log("cloud: ", process.env.CLOUDINARY_CLOUDE_NAME);

const uploadOnCloudinary = async (localFilePath) => {
    try {
        if (!localFilePath) return null;

        //: upload file on cloudinary
        const response = await cloudinary.uploader.upload(localFilePath, {
            resource_type: "auto",
        });
        // console.log("Response: ", response);

        //: file has been uploaded successfully
        // console.log(
        //     "file is uploaded on cloudinary successfully.",
        //     response.url
        // );

        //: Remove file from local server after uploaded on cloud successfully.
        fs.unlinkSync(localFilePath);

        //: return response
        return response;
    } catch (error) {
        fs.unlinkSync(localFilePath); // Remove the locally saved temporary file as the upload operation got faild
        return null;
    }
};

const deleteFromCloudinary = async (cloudinaryFileName) => {
    try {
        if (!cloudinaryFileName) {
            return null;
        }

        const response = await cloudinary.uploader.destroy(cloudinaryFileName, {
            resource_type: "image",
            invalidate: true,
        });

        console.log("Delete From Cloudinary: ", response);

        return response;
    } catch (error) {
        console.log("Error on deleteFromCloudinary :: ", error);
        return null;
    }
};

export { uploadOnCloudinary, deleteFromCloudinary };
