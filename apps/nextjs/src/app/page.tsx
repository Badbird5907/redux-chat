"use client";

import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@redux/backend/convex/_generated/api";
import { Button } from "@redux/ui/components/button";
import { Input } from "@redux/ui/components/input";
import { Card } from "@redux/ui/components/card";

export default function HomePage() {
  const posts = useQuery(api.functions.getPosts);
  const createPost = useMutation(api.functions.createPost);
  
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !content.trim()) return;
    
    setIsSubmitting(true);
    try {
      await createPost({ title, content });
      setTitle("");
      setContent("");
    } catch (error) {
      console.error("Failed to create post:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="container mx-auto max-w-4xl px-4 py-8">
      <h1 className="text-4xl font-bold mb-8">Posts</h1>
      
      <Card className="p-6 mb-8">
        <h2 className="text-2xl font-semibold mb-4">Create New Post</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="title" className="block text-sm font-medium mb-2">
              Title
            </label>
            <Input
              id="title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Enter post title"
              disabled={isSubmitting}
            />
          </div>
          <div>
            <label htmlFor="content" className="block text-sm font-medium mb-2">
              Content
            </label>
            <textarea
              id="content"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Enter post content"
              disabled={isSubmitting}
              className="w-full min-h-[100px] px-3 py-2 rounded-md border border-input bg-background text-foreground"
            />
          </div>
          <Button type="submit" disabled={isSubmitting || !title.trim() || !content.trim()}>
            {isSubmitting ? "Creating..." : "Create Post"}
          </Button>
        </form>
      </Card>

      <div className="space-y-4">
        <h2 className="text-2xl font-semibold">All Posts</h2>
        {posts === undefined ? (
          <p>Loading posts...</p>
        ) : posts.length === 0 ? (
          <p className="text-muted-foreground">No posts yet. Create one above!</p>
        ) : (
          posts.map((post) => (
            <Card key={post._id} className="p-6">
              <h3 className="text-xl font-semibold mb-2">{post.title}</h3>
              <p className="text-muted-foreground">{post.content}</p>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
