import { useCallback, useState } from "react";
import { FileWithPath, useDropzone } from "react-dropzone";
import { Button } from "@/components/ui";
import { convertFileToUrl } from "@/lib/utils";
import axios from "axios";
import { ID, Query, Client, Databases, Storage } from "appwrite";

// Environment variables
const APPWRITE_PROJECT_ID = import.meta.env.VITE_APPWRITE_PROJECT_ID;
const APPWRITE_ENDPOINT = import.meta.env.VITE_APPWRITE_URL;
const DATABASE_ID = import.meta.env.VITE_APPWRITE_DATABASE_ID;
const USER_COLLECTION_ID = import.meta.env.VITE_APPWRITE_USER_COLLECTION_ID;
const IMAGE_COLLECTION_ID = import.meta.env.VITE_APPWRITE_POST_COLLECTION_ID;
const STORAGE_BUCKET_ID = import.meta.env.VITE_APPWRITE_STORAGE_ID;
const ML_API_URL = "https://detect.roboflow.com/drug_detection_project/9";
const ML_API_KEY = "Ajvqkk4nNlEiT1PUvWWD";

type FileUploaderProps = {
  fieldChange: (files: File[]) => void;
  mediaUrl: string;
  userId: string;
};

const FileUploader = ({ fieldChange, mediaUrl, userId }: FileUploaderProps) => {
  const [file, setFile] = useState<File[]>([]);
  const [fileUrl, setFileUrl] = useState<string>(mediaUrl);

  const onDrop = useCallback(
    async (acceptedFiles: FileWithPath[]) => {
      setFile(acceptedFiles);
      fieldChange(acceptedFiles);
      const localFileUrl = convertFileToUrl(acceptedFiles[0]);
      setFileUrl(localFileUrl);

      try {
        // Initialize Appwrite client
        const client = new Client()
          .setEndpoint(APPWRITE_ENDPOINT)
          .setProject(APPWRITE_PROJECT_ID);

        const storage = new Storage(client);
        const databases = new Databases(client);

        // Upload the file to Appwrite Storage
        const appwriteFile = await storage.createFile(
          STORAGE_BUCKET_ID,
          ID.unique(),
          acceptedFiles[0]
        );

        const fileId = appwriteFile.$id;
        const fileUrl = `${APPWRITE_ENDPOINT}/storage/buckets/${STORAGE_BUCKET_ID}/files/${fileId}/view?project=${APPWRITE_PROJECT_ID}`;

        // Create an image document with all required fields
        const imageDocument = await databases.createDocument(
          DATABASE_ID,
          IMAGE_COLLECTION_ID,
          ID.unique(),
          {
            imageId: fileId,  // Using storage file ID as imageId
            imageUrl: fileUrl,
            flag: false,
            creator: userId,  // Adding creator field if required
            caption: "",      // Adding empty caption if required
            likes: [],       // Initialize empty likes array if required
            tags: [],        // Initialize empty tags array if required
            
          }
        );

        // Perform the ML prediction
        const response = await axios.post(ML_API_URL, null, {
          params: {
            api_key: ML_API_KEY,
            image: fileUrl,
          },
        });

        const predictions = response.data.predictions;
        if (predictions && predictions.length > 0) {
          const { confidence } = predictions[0];

          // Check if confidence is greater than 50%
          if (confidence * 100 > 50) {
            // Update flags for the specific user and image
            await updateAppwriteFlags(userId, imageDocument.$id, true);
          }
        }
      } catch (error) {
        console.error("Error uploading the file or fetching prediction:", error);
        // Log more detailed error information
        if (error instanceof Error) {
          console.error("Error details:", error.message);
        }
      }
    },
    [userId]
  );

  const { getRootProps, getInputProps } = useDropzone({
    onDrop,
    accept: {
      "image/*": [".png", ".jpeg", ".jpg"],
    },
  });

  const updateAppwriteFlags = async (userId: string, imageId: string, flagValue: boolean) => {
    try {
      const client = new Client()
        .setEndpoint(APPWRITE_ENDPOINT)
        .setProject(APPWRITE_PROJECT_ID);

      const databases = new Databases(client);

      // Update the specific user's flag
      await databases.updateDocument(
        DATABASE_ID,
        USER_COLLECTION_ID,
        userId,
        { flag: flagValue }
      );

      // Update the specific image's flag
      await databases.updateDocument(
        DATABASE_ID,
        IMAGE_COLLECTION_ID,
        imageId,
        { flag: flagValue }
      );
    } catch (error) {
      console.error("Error updating flags in Appwrite:", error);
      if (error instanceof Error) {
        console.error("Error details:", error.message);
      }
    }
  };

  return (
    <div
      {...getRootProps()}
      className="flex flex-center flex-col bg-dark-3 rounded-xl cursor-pointer">
      <input {...getInputProps()} className="cursor-pointer" />

      {fileUrl ? (
        <>
          <div className="flex flex-1 justify-center w-full p-5 lg:p-10">
            <img src={fileUrl} alt="image" className="file_uploader-img" />
          </div>
          <p className="file_uploader-label">Click or drag photo to replace</p>
        </>
      ) : (
        <div className="file_uploader-box ">
          <img
            src="/assets/icons/file-upload.svg"
            width={96}
            height={77}
            alt="file upload"
          />

          <h3 className="base-medium text-light-2 mb-2 mt-6">
            Drag photo here
          </h3>
          <p className="text-light-4 small-regular mb-6">SVG, PNG, JPG</p>

          <Button type="button" className="shad-button_dark_4">
            Select from computer
          </Button>
        </div>
      )}
    </div>
  );
};

export default FileUploader;