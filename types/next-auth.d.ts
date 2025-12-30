import NextAuth, { DefaultSession } from "next-auth"

declare module "next-auth" {
    interface Session {
        tenant?: {
            id: string
            name: string
            slug: string
            schema: string
        } | null
        isAdmin?: boolean
        user: {
            id: string
        } & DefaultSession["user"]
    }
}
