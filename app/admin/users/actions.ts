'use server'

import { auth } from '@/lib/auth/config'
import { getMasterClient } from '@/lib/supabase/master'
import { revalidatePath } from 'next/cache'

export async function addUser(formData: FormData) {
    console.log('🚀 Starting addUser action')
    try {
        const session = await auth()
        if (!session?.tenant?.id || !session.isAdmin) {
            console.error('❌ Unauthorized attempt to add user')
            throw new Error('No autorizado')
        }

        const email = (formData.get('email') as string)?.toLowerCase().trim()
        const is_admin = formData.get('role') === 'admin'

        if (!email) throw new Error('Email es requerido')

        console.log(`👤 Adding user ${email} to tenant ${session.tenant.id}`)

        const db = getMasterClient()
        const { error } = await db
            .from('users')
            .upsert({
                email,
                tenant_id: session.tenant.id,
                is_admin
            }, { onConflict: 'tenant_id, email' })

        if (error) {
            console.error('❌ Supabase error adding user:', error)
            throw new Error('Error al agregar usuario: ' + error.message)
        }

        console.log('✅ User added successfully')
        revalidatePath('/admin/users')
    } catch (e: any) {
        console.error('🔥 Server Action Error (addUser):', e)
        throw e // Re-throw to be caught by the action handler, but now we have logs
    }
}

export async function deleteUser(userId: string) {
    const session = await auth()
    if (!session?.tenant?.id || !session.isAdmin) {
        throw new Error('No autorizado')
    }

    const db = getMasterClient()

    // Safety check: Don't let users delete themselves
    if (userId === session.user?.id) {
        throw new Error('No puedes eliminarte a ti mismo')
    }

    const { error } = await db
        .from('users')
        .delete()
        .eq('id', userId)
        .eq('tenant_id', session.tenant.id) // Security: only delete from own tenant

    if (error) {
        console.error('Error deleting user:', error)
        throw new Error('Error al eliminar usuario')
    }

    revalidatePath('/admin/users')
}

export async function updateUserRole(userId: string, isAdmin: boolean) {
    const session = await auth()
    if (!session?.tenant?.id || !session.isAdmin) {
        throw new Error('No autorizado')
    }

    const db = getMasterClient()
    const { error } = await db
        .from('users')
        .update({ is_admin: isAdmin })
        .eq('id', userId)
        .eq('tenant_id', session.tenant.id)

    if (error) {
        console.error('Error updating user role:', error)
        throw new Error('Error al actualizar rol')
    }

    revalidatePath('/admin/users')
}

export async function updateUserPhone(userId: string, whatsappPhone: string) {
    const session = await auth()
    if (!session?.tenant?.id || !session.isAdmin) {
        throw new Error('No autorizado')
    }

    const db = getMasterClient()
    const { error } = await db
        .from('users')
        .update({ whatsapp_phone: whatsappPhone || null })
        .eq('id', userId)
        .eq('tenant_id', session.tenant.id)

    if (error) {
        console.error('Error updating user phone:', error)
        throw new Error('Error al actualizar teléfono')
    }

    revalidatePath('/admin/users')
}
