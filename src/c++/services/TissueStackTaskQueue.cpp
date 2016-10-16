/*
 * This file is part of TissueStack.
 *
 * TissueStack is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * TissueStack is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with TissueStack.  If not, see <http://www.gnu.org/licenses/>.
 */
#include "tissuestack.h"
#include "networking.h"
#include "imaging.h"
#include "database.h"
#include "services.h"

tissuestack::services::TissueStackTaskQueue::TissueStackTaskQueue()
{

	const std::string dir =	tissuestack::services::TissueStackTaskQueue::getTasksDirectory();
	if (!tissuestack::utils::System::directoryExists(dir) &&
		!tissuestack::utils::System::createDirectory(dir, 0755))
			THROW_TS_EXCEPTION(tissuestack::common::TissueStackApplicationException,
				"Could not create tasks directory!");

	// read in all task files listed in the queue file
	const std::vector<std::string> tasksIds = this->getTasksFromQueueFile();

	// walk through the list and build the task objects based on the task file content
	// this makes sure that we don't modify the tasks while we are populating
	{
		std::lock_guard<std::mutex> lock(this->_tasks_mutex);
		for (auto id : tasksIds)
			this->buildTaskFromIndividualTaskFile(id);
	}

	// because things might have changed already (unsuccessful imports) we write back
	this->writeTasksToQueueFile();
}

tissuestack::services::TissueStackTaskQueue::~TissueStackTaskQueue() {}

const bool tissuestack::services::TissueStackTaskQueue::doesInstanceExist()
{
	return (tissuestack::services::TissueStackTaskQueue::_instance != nullptr);
}

void tissuestack::services::TissueStackTaskQueue::purgeInstance()
{
	if (tissuestack::services::TissueStackTaskQueue::_instance)
	{

		// before we destroy everything, persist it to disk
		this->writeTasksToQueueFile();

		// this makes sure that we don't modify the tasks while we are doing this traversal
		{
			std::lock_guard<std::mutex> lock(this->_tasks_mutex);

			// walk through entries, persist their state and clean them up
			for (auto task : this->_tasks)
			{
				if (task == nullptr)
					continue;

				this->writeBackToIndividualTasksFile(task);
				delete task;
			}
			this->_tasks.clear();
		}

		delete tissuestack::services::TissueStackTaskQueue::_instance;
		tissuestack::services::TissueStackTaskQueue::_instance = nullptr;
	}
}

tissuestack::services::TissueStackTaskQueue * tissuestack::services::TissueStackTaskQueue::instance()
{
	if (tissuestack::services::TissueStackTaskQueue::_instance == nullptr)
		tissuestack::services::TissueStackTaskQueue::_instance = new tissuestack::services::TissueStackTaskQueue();

	return tissuestack::services::TissueStackTaskQueue::_instance;
}

void tissuestack::services::TissueStackTaskQueue::persistTaskProgress(const std::string & task_id)
{
	const tissuestack::services::TissueStackTask * hit =
		this->findTaskById(task_id);
	if (hit == nullptr)
		return;

	std::lock_guard<std::mutex> lock(this->_tasks_mutex);
	this->writeBackToIndividualTasksFile(hit);
}

inline void tissuestack::services::TissueStackTaskQueue::eraseTask(const std::string & task_id)
{
	unsigned int i = 0;
	for (auto task : this->_tasks)
	{
		if (task->getId().compare(task_id) == 0)
		{
			delete task;
			break;
		}

		i++;
	}
	if (i < this->_tasks.size())
		this->_tasks.erase(this->_tasks.begin()+i);
}

inline void tissuestack::services::TissueStackTaskQueue::writeBackToIndividualTasksFile(const tissuestack::services::TissueStackTask * task)
{
	if (task == nullptr) return;

	const std::string taskFile = tissuestack::services::TissueStackTaskQueue::getTasksDirectory() + "/" + task->getId();
	int fd = open(taskFile.c_str(), O_WRONLY | O_CREAT | O_TRUNC, 0644);
	if (fd <= 0)
	{
		tissuestack::logging::TissueStackLogger::instance()->error(
			"Could not persist individual task file %s\n", task->getId().c_str());
		return;
	}

	std::ostringstream taskFileContents;
	if (task->getInputImageData() == nullptr)
		taskFileContents << task->getInputFileName() << std::endl; // line 1 in_file
	else
		taskFileContents << task->getInputImageData()->getFileName() << std::endl; // line 1 in_file
	taskFileContents << task->getType() << std::endl; // line 2 type
	std::string params = "";

	// line 3 => params, we have to cast for that one
	if (task->getType() == tissuestack::services::TissueStackTaskType::CONVERSION)
		params =
			(static_cast<const tissuestack::services::TissueStackConversionTask *>(task))->getOutFile();
	else // TILING
		params =
			(static_cast<const tissuestack::services::TissueStackTilingTask *>(task))->getParametersForTaskFile();

	taskFileContents << params << std::endl; // line 3 params
	taskFileContents << task->getSlicesDone() << std::endl; // line 4 progress
	taskFileContents << task->getTotalSlices() << std::endl; // line 5 total work

	const std::string contents = taskFileContents.str();
	// write to file
	if (write(fd, contents.c_str(), contents.size()) < 0)
		tissuestack::logging::TissueStackLogger::instance()->error(
			"Could not write into individual task file %s\n", task->getId().c_str());
	close(fd);

	// rename if we are done or cancelled
	if (task->getStatus() == tissuestack::services::TissueStackTaskStatus::CANCELLED)
		rename(taskFile.c_str(), (taskFile + ".cancelled").c_str());
	else if (task->getStatus() == tissuestack::services::TissueStackTaskStatus::FINISHED)
		rename(taskFile.c_str(), (taskFile + ".done").c_str());
	else if (task->getStatus() == tissuestack::services::TissueStackTaskStatus::ERRONEOUS)
		rename(taskFile.c_str(), (taskFile + ".error").c_str());
}

void tissuestack::services::TissueStackTaskQueue::flagTaskAsFinished(
		const std::string & task_id,
		const bool was_cancelled,
		const bool erase_task)
{
	const tissuestack::services::TissueStackTask * hit =
		this->findTaskById(task_id);

	if (hit == nullptr) return;

	this->flagTask(hit,
		was_cancelled ? tissuestack::services::TissueStackTaskStatus::CANCELLED :
			tissuestack::services::TissueStackTaskStatus::FINISHED,
			erase_task);
}

void tissuestack::services::TissueStackTaskQueue::flagTaskAsErroneous(
		const std::string & task_id,
		const bool erase_task)
{
	const tissuestack::services::TissueStackTask * hit =
		this->findTaskById(task_id);

	if (hit == nullptr) return;
	this->flagTask(hit, tissuestack::services::TissueStackTaskStatus::ERRONEOUS, erase_task);
}

inline void tissuestack::services::TissueStackTaskQueue::flagTask(
		const tissuestack::services::TissueStackTask * hit,
		const tissuestack::services::TissueStackTaskStatus status,
		const bool erase_task)
{
	if (hit == nullptr) return;

	{
		std::lock_guard<std::mutex> lock(this->_tasks_mutex);

		const_cast<tissuestack::services::TissueStackTask *>(hit)->setStatus(status);
		this->writeBackToIndividualTasksFile(hit);
		if (erase_task) this->eraseTask(hit->getId());
	}

	this->writeTasksToQueueFile();
}

inline void tissuestack::services::TissueStackTaskQueue::flagUnaddedTask(
		const tissuestack::services::TissueStackTask * hit,
		const tissuestack::services::TissueStackTaskStatus status)
{
	if (hit == nullptr) return;

	const_cast<tissuestack::services::TissueStackTask *>(hit)->setStatus(status);
	this->writeBackToIndividualTasksFile(hit);
	delete hit;
}


void tissuestack::services::TissueStackTaskQueue::writeTasksToQueueFile()
{
	std::ostringstream taskFileContents;
	// this makes sure that we don't modify the tasks while we are doing this traversal
	{
		std::lock_guard<std::mutex> lock(this->_tasks_mutex);

		taskFileContents << "";
		for (auto task : this->_tasks)
			if (task->getStatus() == tissuestack::services::TissueStackTaskStatus::QUEUED ||
					task->getStatus() == tissuestack::services::TissueStackTaskStatus::UNZIPPING ||
					task->getStatus() == tissuestack::services::TissueStackTaskStatus::IN_PROCESS)
				taskFileContents << task->getId() << std::endl;
	}

	// this makes sure that we don't overwrite our queue file simultaneously
	std::lock_guard<std::mutex> lock(this->_queue_mutex);

	const std::string taskFile = tissuestack::services::TissueStackTaskQueue::getTasksDirectory() + "/general";
	// rename old task file
	if (rename(taskFile.c_str(), (taskFile + ".old").c_str()) != 0)
		THROW_TS_EXCEPTION(tissuestack::common::TissueStackApplicationException,
			"Failed to rename task queue file!");

	// create and open new task file for writing
	int fd = open(taskFile.c_str(), O_WRONLY | O_CREAT | O_TRUNC, 0644);
	if (fd <= 0)
	{
		THROW_TS_EXCEPTION(tissuestack::common::TissueStackApplicationException,
			"Could not create new task queue file!");
		rename((taskFile + ".old").c_str(), taskFile.c_str());
		return;
	}

	const std::string contents = taskFileContents.str();
	// dump new contents
	if (write(fd, contents.c_str(), contents.size()) < 0)
	{
		THROW_TS_EXCEPTION(tissuestack::common::TissueStackApplicationException,
			"Could not save new task queue file!");
		unlink(taskFile.c_str());
		rename((taskFile + ".old").c_str(), taskFile.c_str());
		return;
	}
	// close file and delete old one
	close(fd);
	unlink((taskFile + ".old").c_str());
}

const bool tissuestack::services::TissueStackTaskQueue::doesTaskExistForDataSet(
	const std::string & name, const bool is_being_tiled_check, const bool is_being_converted_check)
{
	if (this->_tasks.empty() || name.empty()) return false;

	// this makes sure that we don't modify the tasks while we are doing this traversal
	std::lock_guard<std::mutex> lock(this->_tasks_mutex);

	unsigned int totalTasksForDataSet = 0;
	unsigned int busyTasksForDataSet = 0;

	for (auto t : this->_tasks)
	{
		const std::string input_data_file_name =
			t->getInputImageData() == nullptr ?
				t->getInputFileName() :
				t->getInputImageData()->getFileName();

		if (input_data_file_name.compare(name) == 0)
		{
			totalTasksForDataSet++;

			if (is_being_tiled_check &&
				t->getType() == tissuestack::services::TissueStackTaskType::TILING &&
				(t->getStatus() == tissuestack::services::TissueStackTaskStatus::QUEUED ||
					t->getStatus() == tissuestack::services::TissueStackTaskStatus::IN_PROCESS))
			{
				busyTasksForDataSet++;
				continue;
			}

			if (is_being_converted_check &&
				t->getType() == tissuestack::services::TissueStackTaskType::CONVERSION &&
				(t->getStatus() == tissuestack::services::TissueStackTaskStatus::QUEUED ||
					t->getStatus() == tissuestack::services::TissueStackTaskStatus::IN_PROCESS ||
					t->getStatus() == tissuestack::services::TissueStackTaskStatus::UNZIPPING))
			{
				busyTasksForDataSet++;
				continue;
			}
		}
	}

	if (totalTasksForDataSet == 0)
		return false;

	if (busyTasksForDataSet == 0)
		return false;

	return true;
}


const bool tissuestack::services::TissueStackTaskQueue::isBeingTiled(
		const tissuestack::services::TissueStackTilingTask * check_t)
{
	if (check_t == nullptr)
		return false;

	const std::string in_file =
		check_t->getInputImageData() == nullptr ?
				check_t->getInputFileName() :
				check_t->getInputImageData()->getFileName();
	if (in_file.empty() || !tissuestack::utils::System::fileExists(in_file)) return false;

	// this makes sure that we don't modify the tasks while we are doing this traversal
	std::lock_guard<std::mutex> lock(this->_tasks_mutex);

	for (auto t : this->_tasks)
	{
		const std::string input_data_file_name =
				t->getInputImageData() == nullptr ?
					t->getInputFileName() :
					t->getInputImageData()->getFileName();
		if (input_data_file_name.compare(in_file) == 0
				&& t->getType() == tissuestack::services::TissueStackTaskType::TILING
				&& (t->getStatus() == tissuestack::services::TissueStackTaskStatus::QUEUED ||
						t->getStatus() == tissuestack::services::TissueStackTaskStatus::IN_PROCESS)
				&& static_cast<const tissuestack::services::TissueStackTilingTask *>(t)->includesZoomLevel(check_t))
			return true;
	}

	return false;
}

const std::string tissuestack::services::TissueStackTaskQueue::generateTaskId()
{
	// we use the present time as millis and append 3 digits of pseudo randomness
	std::string id = std::to_string(tissuestack::utils::System::getSystemTimeInMillis())
		+ tissuestack::utils::System::generatePseudoRandomNumberAsString(3);
	if (this->findTaskById(id)) // through some craziness this id exists, try again
		id =  std::to_string(tissuestack::utils::System::getSystemTimeInMillis())
				+ tissuestack::utils::System::generatePseudoRandomNumberAsString(3);

	return id;
}

void tissuestack::services::TissueStackTaskQueue::addTask(const tissuestack::services::TissueStackTask * task)
{
	if ((task->getType() == tissuestack::services::TissueStackTaskType::CONVERSION &&
			this->isBeingConverted(task->getId()))
		|| (task->getType() == tissuestack::services::TissueStackTaskType::TILING &&
			this->isBeingTiled(static_cast<const tissuestack::services::TissueStackTilingTask *>(task))))
		{
			// we are already being processed, not need to do anything
			delete task;
			return;
		}

	{
		// this makes sure that we don't modify the tasks while we are doing this traversal
		std::lock_guard<std::mutex> lock(this->_tasks_mutex);
		this->_tasks.push_back(task);

		// add the task to the queue and write its individual task file
		this->writeBackToIndividualTasksFile(task);
	}

	// now update the queue file
	this->writeTasksToQueueFile();
}

const tissuestack::services::TissueStackTask * tissuestack::services::TissueStackTaskQueue::findTaskById(const std::string & id)
{
	std::lock_guard<std::mutex> lock(this->_tasks_mutex);

	for (auto t : this->_tasks)
		if (t->getId().compare(id) == 0)
			return t;

	return nullptr;
}

const tissuestack::services::TissueStackTask * tissuestack::services::TissueStackTaskQueue::getNextTask(const bool set_processing_flag)
{
	std::lock_guard<std::mutex> lock(this->_tasks_mutex);

	if (this->_tasks.empty()) return nullptr;

	unsigned int t;
	for (t=0;t<this->_tasks.size();t++) // fast forward past anything that is not queued
	{
		if (this->_tasks[t]->getStatus() == tissuestack::services::TissueStackTaskStatus::QUEUED ||
				this->_tasks[t]->getStatus() == tissuestack::services::TissueStackTaskStatus::UNZIPPING)
			break;
		t++;
	}

	if (t >= this->_tasks.size())
		return nullptr; // we found no candidates

	if (set_processing_flag &&
		this->_tasks[t]->getStatus() != tissuestack::services::TissueStackTaskStatus::UNZIPPING)
		const_cast<tissuestack::services::TissueStackTask *>(this->_tasks[t])->setStatus(
			tissuestack::services::TissueStackTaskStatus::IN_PROCESS);

	return this->_tasks[t];
}

const bool tissuestack::services::TissueStackTaskQueue::isBeingConverted(const std::string in_file)
{
	if (in_file.empty() || !tissuestack::utils::System::fileExists(in_file)) return false;

	// this makes sure that we don't modify the tasks while we are doing this traversal
	std::lock_guard<std::mutex> lock(this->_tasks_mutex);

	for (auto t : this->_tasks)
	{
		if (t->getType() != tissuestack::services::TissueStackTaskType::CONVERSION)
			continue;

		const tissuestack::services::TissueStackConversionTask * conv_task =
			static_cast<const tissuestack::services::TissueStackConversionTask *>(t);

		const std::string input_data_file_name =
				t->getInputImageData() == nullptr ?
					t->getInputFileName() :
					t->getInputImageData()->getFileName();

		if ((input_data_file_name.compare(in_file) == 0 ||
				conv_task->getOutFile().compare(in_file) == 0)
				&& (conv_task->getStatus() == tissuestack::services::TissueStackTaskStatus::QUEUED ||
					conv_task->getStatus() == tissuestack::services::TissueStackTaskStatus::UNZIPPING ||
					conv_task->getStatus() == tissuestack::services::TissueStackTaskStatus::IN_PROCESS))
			return true;
	}

	return false;
}

inline void tissuestack::services::TissueStackTaskQueue::buildTaskFromIndividualTaskFile(const std::string & task_id)
{
	const std::vector<std::string> lines =
		tissuestack::utils::System::readTextFileLineByLine(
			tissuestack::services::TissueStackTaskQueue::getTasksDirectory() + "/" + task_id);

	/*
	 * Layout for task files is as follows:
	 * -------------------------------------
	 * 1. line: in file
	 * 2. line: enum value of type denoting either tiling or conversion  TODO: find this
	 * 3. line:
	 * 		for conversion: the out file location
	 * 		for tiling: the following information all separated by |
	 *			tiling directory, dimension names (separated by ,)
	 *			zoom levels (separated by ,), color map name,
	 *			square length and image format
	 * 4. line:
	 *		'slice number' determining present progress uniquely
	 *		given the params above and the order of work/dimensions
	 * 5. line:
	 *		'total slice number' as determined by the params above
	 *
	 * All of the information is needed and if missing we'll make a note of that in the error log
	 */
	if (lines.size() != 5)
	{
		tissuestack::logging::TissueStackLogger::instance()->error(
				"Task File %s does not have 5 lines!\n", task_id.c_str());
		return;
	}

	unsigned short lineNumber = 1;
	unsigned short type = 666;
	std::string in_file = "";
	std::string params = "";

	unsigned long long int sliceProgress = 0;
	unsigned long long int totalSlices = 0;
	for (auto l : lines)
	{
		l = tissuestack::utils::Misc::eraseCharacterFromString(l, '\n');
		switch (lineNumber)
		{
			case 1:
				in_file = l;
				break;
			case 2:
				type = static_cast<unsigned short>(atoi(l.c_str()));
				break;
			case 3:
				params = l;
				break;
			case 4:
				sliceProgress = strtoull(l.c_str(), NULL, 10);
				break;
			case 5:
				totalSlices = strtoull(l.c_str(), NULL, 10);
				break;
		}
		lineNumber++;
	}

	// preliminary check
	if (type != tissuestack::services::TissueStackTaskType::CONVERSION &&
			type != tissuestack::services::TissueStackTaskType::TILING &&
			type != tissuestack::services::TissueStackTaskType::DRAWING)
	{
		tissuestack::logging::TissueStackLogger::instance()->error(
				"Task File %s is not drawing, conversion, nor tiling!\n", task_id.c_str());
		return;
	}

	// now try and instantiate the tasks, something can happen here still
	// we try catch and make a note and skip !!
	try
	{
		tissuestack::services::TissueStackTask * aNewTask = nullptr;

		if (type == tissuestack::services::TissueStackTaskType::CONVERSION)
		{
			aNewTask = new tissuestack::services::TissueStackConversionTask(
				task_id,
				in_file,
				params);
		} else if (type == tissuestack::services::TissueStackTaskType::TILING)
		{
			const std::vector<std::string> tokens =
				tissuestack::utils::Misc::tokenizeString(
					tissuestack::utils::Misc::eliminateWhitespaceAndUnwantedEscapeCharacters(params), ':');
			if (tokens.size() != 6)
			{
				tissuestack::logging::TissueStackLogger::instance()->error(
							"Task File %s needs 6 tokens in line 3 for tiling!\n", task_id.c_str());
					return;
			}
			const std::vector<std::string> dimensions =
					tissuestack::utils::Misc::tokenizeString(tokens[1], ',');
			const std::vector<std::string> zoom_levels =
					tissuestack::utils::Misc::tokenizeString(tokens[2], ',');
			std::vector<unsigned short> numLevels;
			for (auto z : zoom_levels)
				numLevels.push_back(static_cast<unsigned short>(atoi(z.c_str())));

			aNewTask = new tissuestack::services::TissueStackTilingTask(
				task_id,
				in_file,
				tokens[0],
				dimensions,
				numLevels,
				tokens[3],
				static_cast<unsigned short>(atoi(tokens[4].c_str())),
				tokens[5]);
		} else if (type == tissuestack::services::TissueStackTaskType::DRAWING)
		{
			
		}

		// some more checks for the progress/total figures
		if (sliceProgress > totalSlices) // we cannot have more progress than total work...
		{
			tissuestack::logging::TissueStackLogger::instance()->error(
					"Task File %s: the progress is greater than the total!", task_id.c_str());
			this->flagUnaddedTask(aNewTask, tissuestack::services::TissueStackTaskStatus::ERRONEOUS);
			return;
		}
		if (sliceProgress == totalSlices) // we are finished and need not be added any more...
		{
			tissuestack::logging::TissueStackLogger::instance()->error(
					"Task File %s: we have already reached 100% !", task_id.c_str());
			this->flagUnaddedTask(aNewTask, tissuestack::services::TissueStackTaskStatus::FINISHED);
			return;
		}

		if (aNewTask)
		{
			aNewTask->setSlicesDone(sliceProgress);
			aNewTask->setTotalSlices(totalSlices);
			this->_tasks.push_back(aNewTask);
		}
	} catch(std::exception & bad)
	{
		tissuestack::logging::TissueStackLogger::instance()->error(
			"Failed to instantiate task %s: %s\n", task_id.c_str(), bad.what());
	}
}

const std::vector<std::string> tissuestack::services::TissueStackTaskQueue::getTasksFromQueueFile()
{
	// this makes sure that we don't read/write to the queue file at the same time!
	std::lock_guard<std::mutex> lock(this->_queue_mutex);

	const std::string taskFile = tissuestack::services::TissueStackTaskQueue::getTasksDirectory() + "/general";
	if (!tissuestack::utils::System::fileExists(taskFile))
	{
		// nothing there. perhaps we have an .old file from an interruption during queue file write
		if (tissuestack::utils::System::fileExists((taskFile + ".old").c_str()))
		{
			// hooray, let's restore it
			if (rename((taskFile + ".old").c_str(), taskFile.c_str()) == 0)
				return	tissuestack::utils::System::readTextFileLineByLine(taskFile);

			tissuestack::logging::TissueStackLogger::instance()->error("Failed to restore old Task Queue!\n");
		}
		tissuestack::logging::TissueStackLogger::instance()->error("Task Queue File does not exist! We'll try and create it!\n");
		int touchedFile = open(taskFile.c_str(), O_WRONLY | O_CREAT | O_TRUNC, 0644);
		if (touchedFile <= 0)
			THROW_TS_EXCEPTION(tissuestack::common::TissueStackApplicationException, "Could not create the tasks queue file!");
		close(touchedFile);
	}

	return tissuestack::utils::System::readTextFileLineByLine(taskFile);
}


 void tissuestack::services::TissueStackTaskQueue::dumpAllTasksToDebugLog() const
 {
	for (auto task : this->_tasks)
		task->dumpTaskToDebugLog();
 }

const std::string tissuestack::services::TissueStackTaskQueue::getTasksDirectory()
{
	std::string dir =
		tissuestack::database::ConfigurationDataProvider::findSpecificApplicationDirectory("tasks_directory");
	if (dir.empty())
		dir = TASKS_PATH;

	return dir;
}


tissuestack::services::TissueStackTaskQueue * tissuestack::services::TissueStackTaskQueue::_instance = nullptr;
