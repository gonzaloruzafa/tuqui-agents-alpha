'use server'

import { auth } from '@/lib/auth/config'
import { getMasterClient } from '@/lib/supabase/master'
import { revalidatePath } from 'next/cache'

export async function addUser(formData: FormData) {
    const session = await auth()
    if (!session?.tenant?.id || !session.isAdmin) {
        throw new Error('No autorizado')
    }

    const email = formData.get('email') as string
    const role = formData.get('role') as string || 'user'
    const is_admin = role === 'admin'

    if (!email) throw new Error('Email es requerido')

    const db = getMasterClient()
    const { error } = await db
        .from('users')
        .upsert({
            email,
            tenant_id: session.tenant.id,
            role,
            is_admin
        }, { onConflict: 'email' })

    if (error) {
        console.error('Error adding user:', error)
        throw new Error('Error al agregar usuario: ' + error.message)
    }

    revalidatePath('/admin/users')
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
        .update({ is_admin: isAdmin, role: isAdmin ? 'admin' : 'user' })
        .eq('id', userId)
        .eq('tenant_id', session.tenant.id)

    if (error) {
        console.error('Error updating user role:', error)
        throw new Error('Error al actualizar rol')
    }

    revalidatePath('/admin/users')
}
