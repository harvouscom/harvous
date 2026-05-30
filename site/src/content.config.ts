import { defineCollection, z } from "astro:content";
import { glob } from "astro/loaders";

const features = defineCollection({
  loader: glob({ pattern: "**/*.mdx", base: "./src/content/features" }),
  schema: z.object({
    title: z.string(),
    tagline: z.string(),
    order: z.number(),
    align: z.enum(["left", "right"]).default("left"),
  }),
});

const faq = defineCollection({
  loader: glob({ pattern: "**/*.mdx", base: "./src/content/faq" }),
  schema: z.object({
    question: z.string(),
    order: z.number(),
  }),
});

const testimonials = defineCollection({
  loader: glob({ pattern: "**/*.mdx", base: "./src/content/testimonials" }),
  schema: z.object({
    name: z.string(),
    when: z.string(),
    order: z.number(),
  }),
});

const blog = defineCollection({
  loader: glob({ pattern: "**/*.{md,mdx}", base: "./src/content/blog" }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    publishDate: z.coerce.date(),
    category: z.enum(["study-habits", "behind-the-build", "scripture-study", "product"]),
    readingTime: z.number().optional(),
    draft: z.boolean().default(false),
  }),
});

export const collections = { features, faq, testimonials, blog };
