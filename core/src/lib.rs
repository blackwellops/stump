#[macro_use]
extern crate rocket;

use std::sync::Arc;

// TODO: for these crates, some should NOT hoist entire crate, I need to restrict it
// to only what is necessary... UGH.

pub mod config;
pub mod db;
pub mod event;
pub mod fs;
pub mod job;
pub mod opds;

// TODO: I don't really want this to be pub. I think the only way that is possible is if I
// made ALL the DB operations pub, interfacing with the prisma client directly. This way,
// the server invokes those functions, rather than building those queries. I don't see a nice,
// neat way to do this that won't give me a migraine lol.
pub mod prisma;
pub mod types;

use config::context::Ctx;
use config::logging::STUMP_SHADOW_TEXT;
use config::{env::StumpEnv, logging::init_fern};
use event::{event_manager::EventManager, InternalCoreTask};
use rocket::tokio::sync::mpsc::unbounded_channel;
use types::{errors::CoreError, CoreResult};

/// The [`StumpCore`] struct is the main entry point for any server-side Stump
/// applications. It is responsible for managing incoming tasks ([`InternalCoreTask`]),
/// outgoing events ([`CoreEvent`](event::CoreEvent)), and providing access to the database
/// via the core's [`Ctx`].
///
/// [`StumpCore`] also provides a few initilization functions, such as `init_logging`. This
/// is provided to standardize various configurations for consumers of the library.
///
/// Example:
/// ```rust
/// use rocket::tokio;
/// use stump_core::StumpCore;
///
/// #[tokio::main]
/// async fn main() {
/// 	assert!(StumpCore::load_env().is_ok());
///		assert!(StumpCore::init_logging().is_ok());
///
/// 	let core = StumpCore::new().await;
///
/// 	// do stuff with core
/// }
pub struct StumpCore {
	ctx: Ctx,
	#[allow(dead_code)]
	event_manager: Arc<EventManager>,
}

impl StumpCore {
	/// Creates a new instance of [`StumpCore`] and returns it wrapped in an [`Arc`].
	pub async fn new() -> Arc<StumpCore> {
		let internal_channel = unbounded_channel::<InternalCoreTask>();

		let core_ctx = Ctx::new(internal_channel.0).await;

		let event_manager = EventManager::new(core_ctx.get_ctx(), internal_channel.1);

		let core = Self {
			ctx: core_ctx,
			event_manager,
		};

		Arc::new(core)
	}

	/// Initializes logging for the core using [`log`] and [`fern`].
	pub fn init_logging() -> Result<(), fern::InitError> {
		init_fern()
	}

	/// Loads environment variables from the `Stump.toml` configuration file, if
	/// it exists, using the [`StumpEnv`] struct.
	pub fn load_env() -> CoreResult<()> {
		StumpEnv::load()
	}

	/// Returns [`StumpCore`] wrapped in an [`Arc`]. Will take ownership of self. Created
	/// for convenience if ever needed to create an instance without using the `new` method.
	pub fn arced(self) -> Arc<Self> {
		Arc::new(self)
	}

	/// Returns a new instance of [`Ctx`]. This is the main context struct for the core,
	/// prividing access to the database and internal channels.
	pub fn get_context(&self) -> Ctx {
		self.ctx.get_ctx()
	}

	/// Returns the shadow text for the core. This is just the fun ascii art that
	/// is printed to the console when the server starts.
	pub fn get_shadow_text(&self) -> &str {
		return STUMP_SHADOW_TEXT;
	}

	/// Runs the database migrations.
	pub async fn run_migrations(&self) -> Result<(), CoreError> {
		db::migration::run_migrations(&self.ctx.db).await
	}
}