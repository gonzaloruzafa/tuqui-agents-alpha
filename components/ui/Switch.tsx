'use client'

import { useState } from 'react'

interface SwitchProps {
    name: string
    defaultChecked?: boolean
    label?: string
    value?: string
}

export function Switch({ name, defaultChecked = false, label, value }: SwitchProps) {
    const [checked, setChecked] = useState(defaultChecked)

    return (
        <label className="relative inline-flex items-center cursor-pointer select-none gap-3">
            {/* Hidden input to always send value */}
            <input type="hidden" name={name} value={checked ? 'on' : 'off'} />
            <input
                type="checkbox"
                className="sr-only peer"
                checked={checked}
                onChange={(e) => setChecked(e.target.checked)}
            />
            <div className={`
                w-11 h-6 rounded-full transition-colors duration-200 ease-in-out
                ${checked ? 'bg-adhoc-violet' : 'bg-gray-200'}
                relative
            `}>
                <div className={`
                    absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow-sm
                    transition-transform duration-200 ease-in-out
                    ${checked ? 'translate-x-5' : 'translate-x-0'}
                `} />
            </div>
            {label && <span className="text-sm font-medium text-gray-700">{label}</span>}
        </label>
    )
}
