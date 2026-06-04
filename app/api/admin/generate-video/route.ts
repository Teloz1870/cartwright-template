import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { VideoGenerator } from "@/lib/tools/video-generator";
import { prisma } from "@/lib/db";

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session?.user || session.user.role !== "admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { imageUrl, prompt, productId } = await req.json();
    if (!imageUrl) {
      return NextResponse.json({ error: "Missing imageUrl" }, { status: 400 });
    }

    const jobId = await VideoGenerator.generateFromImage(imageUrl, prompt);

    if (productId) {
      await prisma.product.update({
        where: { id: productId },
        data: { videoGenerationId: jobId }
      });
    }

    return NextResponse.json({ jobId });
  } catch (error: unknown) {
    console.error("Video Gen Error:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
  }
}

export async function GET(req: Request) {
  try {
    const session = await auth();
    if (!session?.user || session.user.role !== "admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const url = new URL(req.url);
    const jobId = url.searchParams.get("jobId");
    const categoryId = url.searchParams.get("categoryId");
    const productId = url.searchParams.get("productId");

    if (!jobId) {
      return NextResponse.json({ error: "Missing jobId" }, { status: 400 });
    }

    const videoUrl = await VideoGenerator.checkStatus(jobId);

    if (videoUrl) {
      if (categoryId) {
        await prisma.category.update({
          where: { id: categoryId },
          data: { heroVideo: videoUrl }
        });
      }
      if (productId) {
        await prisma.product.update({
          where: { id: productId },
          data: { videoUrl, videoGenerationId: null }
        });
      }
      return NextResponse.json({ status: "completed", videoUrl });
    }

    return NextResponse.json({ status: "pending" });
  } catch (error: unknown) {
    console.error("Video Poll Error:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
  }
}
