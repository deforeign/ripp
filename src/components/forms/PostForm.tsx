import * as z from "zod";
import { Models } from "appwrite";
import { useForm } from "react-hook-form";
import { useNavigate } from "react-router-dom";
import { zodResolver } from "@hookform/resolvers/zod";
import axios from "axios";
import FormData from "form-data";

import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  Button,
  Input,
  Textarea,
} from "@/components/ui";
import { PostValidation } from "@/lib/validation";
import { useToast } from "@/components/ui/use-toast";
import { useUserContext } from "@/context/AuthContext";
import { FileUploader, Loader } from "@/components/shared";
import { useCreatePost, useUpdatePost } from "@/lib/react-query/queries";
import { Client, Storage, Databases } from "appwrite";

// Initialize Appwrite client
const client = new Client();
client
  .setEndpoint(import.meta.env.VITE_APPWRITE_URL)
  .setProject(import.meta.env.VITE_APPWRITE_PROJECT_ID);

const storage = new Storage(client);
const database = new Databases(client);

type PostFormProps = {
  post?: Models.Document;
  action: "Create" | "Update";
};

// Update IUser to include properties your user context provides
interface IUser {
  $id: string;
  id: string;
  flag: boolean;
}

interface Match {
  type: string;
  match: string;
  start: number;
  end: number;
}

interface FlaggedResponse {
  status: string;
  drug: {
    matches: Match[];
  };
}

interface INewPost {
  userId: string;
  caption: string;
  location?: string;
  tags?: string;
  imageId?: string;
  imageUrl?: string;
}

const PostForm = ({ post, action }: PostFormProps) => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user } = useUserContext() as unknown as { user: IUser };
  
  const form = useForm<z.infer<typeof PostValidation>>({
    resolver: zodResolver(PostValidation),
    defaultValues: {
      caption: post ? post?.caption : "",
      file: [],
      location: post ? post.location : "",
      tags: post ? post.tags.join(",") : "",
    },
  });

  const { mutateAsync: createPost, isLoading: isLoadingCreate } = useCreatePost();
  const { mutateAsync: updatePost, isLoading: isLoadingUpdate } = useUpdatePost();

  // Handler for form submission
  const handleSubmit = async (value: z.infer<typeof PostValidation>) => {
    let fileId;

    // Check for prohibited content in the caption
    const flagged = await checkForProhibitedContent(value.caption);
    
    // If flagged, update user's flag status
    if (flagged) {
      await updateUserFlag(user.$id);
    }

    // Handle file upload if a file is selected
    if (value.file && value.file.length > 0) {
      const fileUploadResponse = await uploadFile(value.file[0]);
      fileId = fileUploadResponse.$id;
    }

    if (post && action === "Update") {
      const updatedPost = await updatePost({
        ...value,
        postId: post.$id,
        imageId: fileId || post.imageId,
        imageUrl: post.imageUrl,
      });

      if (!updatedPost) {
        toast({ title: `${action} post failed. Please try again.` });
      }
      return navigate(`/posts/${post.$id}`);
    }

    const newPost = await createPost({
      ...value,
      userId: user.$id,
      imageId: fileId,
    } as INewPost);
    
    if (!newPost) {
      toast({ title: `${action} post failed. Please try again.` });
    }
    navigate("/");
  };

  // Function to check for prohibited content using Sightengine API
  const checkForProhibitedContent = async (caption: string): Promise<boolean> => {
    const data = new FormData();
    data.append("text", caption);
    data.append("lang", "en");
    data.append("categories", "drug");
    data.append("mode", "rules");
    data.append("api_user", import.meta.env.VITE_SIGHTENGINE_USER); // Use environment variable for security
    data.append("api_secret", import.meta.env.VITE_SIGHTENGINE_SECRET); // Use environment variable for security

    try {
      const response = await axios.post('https://api.sightengine.com/1.0/text/check.json', data);
      const { drug } = response.data;

      // Check if any matches are found related to drugs
      return drug.matches.some((match: Match) => match.type === "drug");
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      toast({ title: "Content check failed", description: errorMessage });
      return false; // Assume no prohibited content if an error occurs
    }
  };

  // Function to update user flag in Appwrite
  const updateUserFlag = async (userId: string) => {
    try {
      await database.updateDocument(
        import.meta.env.VITE_APPWRITE_DB_ID,
        "Users",
        userId,
        { flag: true }
      );
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      toast({ title: "User flag update failed", description: errorMessage });
    }
  };

  // Function to handle file upload to Appwrite
  const uploadFile = async (file: File) => {
    try {
      return await storage.createFile(
        import.meta.env.VITE_APPWRITE_STORAGE_ID,
        "unique()",
        file
      );
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "File upload failed.";
      toast({ title: "File upload failed.", description: errorMessage });
      throw error; // Rethrow the error after logging it
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleSubmit)} className="flex flex-col gap-9 w-full max-w-5xl">
        <FormField control={form.control} name="caption" render={({ field }) => (
          <FormItem>
            <FormLabel className="shad-form_label">Caption</FormLabel>
            <FormControl>
              <Textarea className="shad-textarea custom-scrollbar" {...field} />
            </FormControl>
            <FormMessage className="shad-form_message" />
          </FormItem>
        )} />

        <FormField control={form.control} name="file" render={({ field }) => (
          <FormItem>
            <FormLabel className="shad-form_label">Add Photos</FormLabel>
            <FormControl>
              <FileUploader fieldChange={field.onChange} mediaUrl={post?.imageUrl} />
            </FormControl>
            <FormMessage className="shad-form_message" />
          </FormItem>
        )} />

        <FormField control={form.control} name="location" render={({ field }) => (
          <FormItem>
            <FormLabel className="shad-form_label">Add Location</FormLabel>
            <FormControl>
              <Input type="text" className="shad-input" {...field} />
            </FormControl>
            <FormMessage className="shad-form_message" />
          </FormItem>
        )} />

        <FormField control={form.control} name="tags" render={({ field }) => (
          <FormItem>
            <FormLabel className="shad-form_label">Add Tags (separated by comma ",")</FormLabel>
            <FormControl>
              <Input placeholder="Art, Expression, Learn" type="text" className="shad-input" {...field} />
            </FormControl>
            <FormMessage className="shad-form_message" />
          </FormItem>
        )} />

        <div className="flex gap-4 items-center justify-end">
          <Button type="button" className="shad-button_dark_4" onClick={() => navigate(-1)}>
            Cancel
          </Button>
          <Button type="submit" className="shad-button_primary whitespace-nowrap" disabled={isLoadingCreate || isLoadingUpdate}>
            {(isLoadingCreate || isLoadingUpdate) && <Loader />}
            {action} Post
          </Button>
        </div>
      </form>
    </Form>
  );
};

export default PostForm;