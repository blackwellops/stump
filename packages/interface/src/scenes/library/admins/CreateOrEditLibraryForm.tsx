import { zodResolver } from '@hookform/resolvers/zod'
import { useCreateLibraryMutation, useEditLibraryMutation, useTags } from '@stump/client'
import { Button, Form, IconButton, Input, TextArea } from '@stump/components'
import type { Library, LibraryOptions, LibraryPattern, LibraryScanMode } from '@stump/types'
import { Folder } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'react-hot-toast'
import { useNavigate } from 'react-router'
import { z } from 'zod'

import DirectoryPickerModal from '../../../components/DirectoryPickerModal'
import TagSelect from '../../../components/TagSelect'
import { useLocaleContext } from '../../../i18n'
import paths from '../../../paths'
import { useLibraryAdminContext } from './context'
import LibraryOptionsForm from './LibraryOptionsForm'
import ScanModeForm from './ScanModeForm'

function isLibraryScanMode(input: string): input is LibraryScanMode {
	return input === 'SYNC' || input === 'BATCHED' || input === 'NONE' || !input
}

function isLibraryPattern(input: string): input is LibraryPattern {
	return input === 'SERIES_BASED' || input === 'COLLECTION_BASED' || !input
}

const buildScema = (existingLibraries: Library[], library?: Library) =>
	z.object({
		convert_rar_to_zip: z.boolean().default(false),
		create_webp_thumbnails: z.boolean().default(false),
		description: z.string().nullable(),
		hard_delete_conversions: z.boolean().default(false),
		library_pattern: z.string().refine(isLibraryPattern).default('SERIES_BASED'),
		name: z
			.string()
			.min(1, { message: 'Library name is required' })
			.refine(
				// return falsy value to indicate failure. In this case, if library name is already taken,
				// and we aren't editing that library, then it should fail.
				(val) => !(existingLibraries.some((l) => l.name === val) && library?.name !== val),
				(val) => ({
					message: `You already have a library named ${val}.`,
				}),
			),
		path: z
			.string()
			.min(1, { message: 'Library path is required' })
			.refine(
				// check if path is parent to any existing library
				// if so, and we aren't editing that library, return falsy value to indicate failure
				(val) => !(existingLibraries.some((l) => l.path.startsWith(val)) && library?.path !== val),
				() => ({
					message: 'Invalid library, parent directory already exists as library.',
				}),
			),
		scan_mode: z.string().refine(isLibraryScanMode).default('BATCHED'),
		tags: z
			.array(
				z.object({
					label: z.string(),
					value: z.string(),
				}),
			)
			.optional(),
	})
export type Schema = z.infer<ReturnType<typeof buildScema>>

type Props = {
	library?: Library
	existingLibraries: Library[]
}

export default function CreateOrEditLibraryForm({ library, existingLibraries }: Props) {
	const isCreatingLibrary = !library
	const navigate = useNavigate()

	const { syncLibraryPreview } = useLibraryAdminContext()

	const { tags, createTagsAsync, isLoading: isLoadingTags } = useTags()

	const [showDirectoryPicker, setShowDirectoryPicker] = useState(false)

	const { t } = useLocaleContext()

	const schema = buildScema(existingLibraries, library)
	const form = useForm<Schema>({
		defaultValues: {
			convert_rar_to_zip: library?.library_options.convert_rar_to_zip ?? false,
			create_webp_thumbnails: library?.library_options.create_webp_thumbnails ?? false,
			description: library?.description,
			hard_delete_conversions: library?.library_options.hard_delete_conversions ?? false,
			library_pattern: library?.library_options.library_pattern ?? 'SERIES_BASED',
			name: library?.name,
			path: library?.path,
			scan_mode: 'BATCHED',
			tags: library?.tags?.map((t) => ({ label: t.name, value: t.name })),
		},
		reValidateMode: 'onChange',
		resolver: zodResolver(schema),
	})

	const { createLibraryAsync } = useCreateLibraryMutation({
		onSuccess: () => {
			form.reset()
			setTimeout(() => navigate(paths.home()), 750)
		},
	})

	const { editLibraryAsync } = useEditLibraryMutation({
		onSuccess: () => {
			form.reset()
			// TODO: maybe somewhere else?
			setTimeout(() => navigate(paths.home()), 750)
		},
	})

	const handleCreateTag = async (tag: string) => {
		try {
			await createTagsAsync([tag])
		} catch (err) {
			console.error(err)
			// TODO: toast error
		}
	}

	const handleCreateLibrary = async (values: Schema) => {
		const { name, path, description, tags: formTags, scan_mode, ...library_options } = values

		const existingTags = tags.filter((tag) => formTags?.some((t) => t.value === tag.name))
		const tagsToCreate = formTags
			?.map((tag) => tag.value)
			.filter((tagName: string) => !existingTags.some((t) => t.name === tagName))

		if (tagsToCreate && tagsToCreate.length > 0) {
			// TODO: Re-add this logic...
			// const res: ApiResult<Tag[]> = await tryCreateTags(tagsToCreate)
			// if (res.status > 201) {
			// 	toast.error('Something went wrong when creating the tags.')
			// 	return
			// }
			// existingTags = existingTags.concat(res.data)
		}

		toast.promise(
			createLibraryAsync({
				description,
				// FIXME: this isn't dangerous, but the server needs to be adjusted as to not enforce the id field
				// for the library_options object, as we won't have one until after creation
				library_options: library_options as LibraryOptions,
				name,
				path,
				scan_mode,
				tags: existingTags,
			}),
			{
				error: 'Something went wrong.',
				loading: 'Creating library...',
				success: 'Library created!',
			},
		)
	}

	const handleUpdateLibrary = async (values: Schema) => {
		if (!library) {
			return
		}

		const { name, path, description, tags: formTags, scan_mode, ...rest } = values

		const library_options = {
			...rest,
			id: library.library_options.id,
		} as LibraryOptions

		const existingTags = tags.filter((tag) => formTags?.some((t) => t.value === tag.name))

		// const tagsToCreate = formTags
		// 	?.map((tag) => tag.value)
		// 	.filter((tagName: string) => !existingTags.some((t) => t.name === tagName))

		// let removedTags = getRemovedTags(formTags)

		// if (!removedTags?.length) {
		// 	removedTags = null
		// }

		// if (tagsToCreate.length) {
		// 	const res = await tryCreateTags(tagsToCreate)

		// 	if (res.status > 201) {
		// 		toast.error('Something went wrong when creating the tags.')
		// 		return
		// 	}

		// 	existingTags = existingTags.concat(res.data)
		// }

		toast.promise(
			editLibraryAsync({
				...library,
				description,
				library_options,
				name,
				path,
				// removed_tags: removedTags,
				removed_tags: [],
				scan_mode,
				tags: existingTags,
			}),
			{
				error: 'Something went wrong.',
				loading: 'Updating library...',
				success: 'Updates saved!',
			},
		)
	}

	const handleSubmit = (values: Schema) => {
		if (isCreatingLibrary) {
			handleCreateLibrary(values)
		} else {
			handleUpdateLibrary(values)
		}
	}

	const errors = useMemo(() => {
		return form.formState.errors
	}, [form.formState.errors])

	form.watch((updatedValues) => {
		const {
			tags,
			library_pattern,
			convert_rar_to_zip,
			create_webp_thumbnails,
			hard_delete_conversions,
			...preview
		} = updatedValues

		// TODO: Investigate this type error more, I don't like casting...
		syncLibraryPreview({
			...preview,
			library_options: {
				...(library?.library_options ?? {
					id: '',
					library_id: '',
				}),
				convert_rar_to_zip,
				create_webp_thumbnails,
				hard_delete_conversions,
				library_pattern,
			},
			tags: tags?.map((tag) => ({
				id: tag?.value,
				name: tag?.value,
			})),
		} as Partial<Library>)
	})

	const [formPath] = form.watch(['path'])

	return (
		<>
			<DirectoryPickerModal
				isOpen={showDirectoryPicker}
				onClose={() => setShowDirectoryPicker(false)}
				startingPath={formPath}
				onPathChange={(path) => {
					if (path) {
						form.setValue('path', path)
					}
				}}
			/>
			<Form form={form} onSubmit={handleSubmit} className="">
				<div className="flex flex-grow flex-col gap-6">
					<Input
						variant="primary"
						label="Library Name"
						placeholder="My Library"
						containerClassName="max-w-full md:max-w-sm"
						required
						errorMessage={errors.name?.message}
						{...form.register('name')}
					/>
					<Input
						variant="primary"
						label="Library path"
						placeholder="/path/to/library"
						containerClassName="max-w-full md:max-w-sm"
						icon={
							<IconButton
								size="xs"
								variant="ghost"
								type="button"
								onClick={() => setShowDirectoryPicker(true)}
							>
								<Folder className="h-4 w-4 text-gray-700 dark:text-gray-300" />
							</IconButton>
						}
						required
						errorMessage={errors.path?.message}
						{...form.register('path')}
					/>

					<TagSelect
						isLoading={isLoadingTags}
						options={tags.map((tag) => ({ label: tag.name, value: tag.name }))}
						defaultValue={library?.tags?.map((tag) => ({ label: tag.name, value: tag.name }))}
						onCreateTag={handleCreateTag}
					/>

					<TextArea
						className="flex"
						variant="primary"
						label="Description"
						placeholder="A short description of your library (optional)"
						containerClassName="max-w-full md:max-w-sm"
						{...form.register('description')}
					/>
				</div>

				<ScanModeForm isCreatingLibrary={isCreatingLibrary} />

				<LibraryOptionsForm isCreatingLibrary={isCreatingLibrary} />

				<div className="mt-6 flex w-full md:max-w-sm">
					<Button className="w-full md:max-w-sm" variant="primary">
						{isCreatingLibrary ? 'Create' : 'Edit'} Library
					</Button>
				</div>
			</Form>
		</>
	)
}